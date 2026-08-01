import { REDACTED, isSensitiveKey, redact } from "./redact";

/**
 * E7-S1 criterion 4, the test the criterion asks for by name: "Passwords, tokens, cookies, account
 * numbers, and document contents are redacted by a filter, with a test that proves it."
 *
 * The cases are grouped by which of the two passes is doing the work, because that is what a future
 * change is most likely to break: it is easy to add a key to the list and believe the shape pass is
 * still there.
 */
describe("redact", () => {
  describe("by key", () => {
    it("removes the values named in the criterion", () => {
      const out = redact({
        password: "hunter2",
        token: "abc",
        cookie: "sid=1",
        accountNumber: "0123456789",
        sessionId: "s-1",
      }) as Record<string, unknown>;

      expect(out).toEqual({
        password: REDACTED,
        token: REDACTED,
        cookie: REDACTED,
        accountNumber: REDACTED,
        sessionId: REDACTED,
      });
    });

    it("catches the word wherever it sits in the key", () => {
      // The first draft of this filter matched only keys that *ended* with a sensitive word, so
      // `secretKey` and `passwordResetToken` went to the sink in full. Substring matching is the fix
      // and this is the case that fails without it.
      for (const key of [
        "newPassword",
        "password_hash",
        "resetPasswordToken",
        "secretKey",
        "apiKey",
        "accessKeyId",
        "refreshToken",
        "authorization",
        "x-paystack-signature",
        "sellerBvn",
        "ninNumber",
        "otpCode",
        "cardCvv",
      ]) {
        expect(isSensitiveKey(key)).toBe(true);
        expect((redact({ [key]: "leak" }) as Record<string, unknown>)[key]).toBe(REDACTED);
      }
    });

    it("redacts document contents by their structural key", () => {
      const out = redact({
        body: { anything: 1 },
        payload: "x",
        document: { bytes: "…" },
        files: [1, 2],
        raw: "x",
      }) as Record<string, unknown>;

      expect(Object.values(out)).toEqual([REDACTED, REDACTED, REDACTED, REDACTED, REDACTED]);
    });

    it("keeps keys that merely resemble the structural ones", () => {
      // Whole-key matching for this family exists so that ordinary diagnostic fields survive.
      const out = redact({ contentType: "application/pdf", dataSource: "prisma" });
      expect(out).toEqual({ contentType: "application/pdf", dataSource: "prisma" });
    });

    it("over-redacts rather than under-redacts on an ambiguous key", () => {
      // Documented and accepted: `authorId` is caught by `auth`. Losing an id in a log line is a
      // smaller problem than shipping a bearer token, and this asserts the trade-off is deliberate
      // rather than a surprise to whoever reads the output next.
      expect((redact({ authorId: "u-1" }) as Record<string, unknown>).authorId).toBe(REDACTED);
    });
  });

  describe("by shape", () => {
    it("removes a JWT under a key nobody would filter", () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      expect(redact({ note: jwt })).toEqual({ note: REDACTED });
    });

    it("removes an Authorization value that escaped its key", () => {
      expect(redact({ header: "Bearer sk_live_abc123" })).toEqual({ header: REDACTED });
      expect(redact({ header: "Basic dXNlcjpwYXNz" })).toEqual({ header: REDACTED });
    });

    it("masks an account-shaped digit run but keeps the last four", () => {
      // A Prisma unique-constraint message quotes the offending value under no key at all, which is
      // the leak the key pass cannot see.
      expect(redact("Unique constraint failed on 0123456789")).toBe(
        "Unique constraint failed on [redacted:6789]",
      );
      expect(redact({ message: "nin 12345678901 already used" })).toEqual({
        message: "nin [redacted:8901] already used",
      });
    });

    it("leaves a short number-like string alone", () => {
      // Nine digits is not an account, and redacting timestamps and prices would make the log
      // useless. The boundary is asserted so a widened regex fails here rather than in production.
      expect(redact("order 123456789 shipped")).toBe("order 123456789 shipped");
    });
  });

  describe("non-JSON values", () => {
    it("summarises a Buffer by size instead of logging the bytes", () => {
      expect(redact({ scan: Buffer.from("title deed pdf") })).toEqual({
        scan: "[Buffer 14 bytes]",
      });
    });

    it("summarises a typed array the same way", () => {
      expect(redact({ scan: new Uint8Array(8) })).toEqual({ scan: "[Uint8Array 8 bytes]" });
    });

    it("keeps a Date readable and an Error diagnosable", () => {
      const when = new Date("2026-01-02T03:04:05.000Z");
      expect(redact({ when })).toEqual({ when: "2026-01-02T03:04:05.000Z" });

      const error = new Error("card 4111111111111111 declined");
      const out = redact({ error }) as { error: { name: string; message: string; stack?: string } };
      expect(out.error.name).toBe("Error");
      expect(out.error.message).toBe("card [redacted:1111] declined");
      expect(out.error.stack).toContain("redact.spec.ts");
    });

    it("converts a bigint and drops what JSON cannot carry", () => {
      expect(redact({ big: 10n, fn: () => 1, sym: Symbol("s") })).toEqual({ big: "10" });
    });
  });

  describe("safety of the filter itself", () => {
    it("survives a cycle rather than throwing inside the log call", () => {
      const node: Record<string, unknown> = { name: "a" };
      node.self = node;
      expect(redact(node)).toEqual({ name: "a", self: "[circular]" });
    });

    it("stops walking at the depth limit", () => {
      let deep: Record<string, unknown> = { end: true };
      for (let i = 0; i < 8; i += 1) deep = { child: deep };
      expect(JSON.stringify(redact(deep))).toContain("depth limit");
    });

    it("truncates a value long enough to be a document", () => {
      const out = redact("x".repeat(900)) as string;
      expect(out).toHaveLength(512 + "…[truncated]".length);
      expect(out.endsWith("…[truncated]")).toBe(true);
    });

    it("does not mutate what the caller is still using", () => {
      const input = { password: "hunter2", nested: { token: "t" } };
      redact(input);
      expect(input.password).toBe("hunter2");
      expect(input.nested.token).toBe("t");
    });

    it("redacts the same key at any depth", () => {
      expect(redact({ a: { b: { c: { password: "p" } } } })).toEqual({
        a: { b: { c: { password: REDACTED } } },
      });
    });
  });
});
