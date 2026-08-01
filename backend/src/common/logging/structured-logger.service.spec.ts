import { StructuredLogger } from "./structured-logger.service";
import { runInRequestContext } from "./request-context";
import { REDACTED } from "./redact";

/**
 * E7-S1 criteria 1 and 2: "a correlation id … attached to every log line" and "structured JSON in
 * production with a consistent field set".
 *
 * `resolveLevels` and `resolveJson` read the environment once, in the field initialisers, so every
 * case here constructs its own logger under the environment it means to test. A spec that set
 * `LOG_FORMAT` after construction would pass while asserting nothing.
 */

function loggerUnder(env: Record<string, string | undefined>): StructuredLogger {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return new StructuredLogger();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const JSON_ENV = { LOG_FORMAT: "json", LOG_LEVEL: "verbose" };

describe("StructuredLogger", () => {
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const linesFrom = (spy: jest.SpyInstance): Record<string, unknown>[] =>
    spy.mock.calls.map(([written]) => JSON.parse(String(written)) as Record<string, unknown>);

  describe("the envelope", () => {
    it("emits one JSON object per line with the agreed field set", () => {
      loggerUnder(JSON_ENV).write("log", "listing published", { context: "ListingsService" });

      expect(stdout).toHaveBeenCalledTimes(1);
      const written = String(stdout.mock.calls[0][0]);
      expect(written.endsWith("\n")).toBe(true);
      expect(written.trimEnd()).not.toContain("\n");

      const line = JSON.parse(written) as Record<string, unknown>;
      expect(line).toMatchObject({
        level: "log",
        msg: "listing published",
        context: "ListingsService",
      });
      expect(typeof line.ts).toBe("string");
      expect(new Date(line.ts as string).toISOString()).toBe(line.ts);
    });

    it("sends faults to stderr and everything else to stdout", () => {
      const logger = loggerUnder(JSON_ENV);
      logger.verbose("v");
      logger.debug("d");
      logger.log("l");
      logger.warn("w");
      logger.error("e");
      logger.fatal("f");

      expect(linesFrom(stdout).map((line) => line.level)).toEqual(["verbose", "debug", "log", "warn"]);
      expect(linesFrom(stderr).map((line) => line.level)).toEqual(["error", "fatal"]);
    });

    it("does not let a caller field impersonate the envelope", () => {
      // A payload that carried its own `level` could otherwise file an error as an info line, which
      // is the difference between a page at 3am and nobody noticing.
      loggerUnder(JSON_ENV).write("error", "boom", { level: "log", ts: "1999", msg: "harmless" });

      const [line] = linesFrom(stderr);
      expect(line).toMatchObject({ level: "error", msg: "boom" });
      expect(line.ts).not.toBe("1999");
    });

    it("writes human-readable output when a terminal is reading", () => {
      loggerUnder({ LOG_FORMAT: "human", LOG_LEVEL: "verbose" }).write("warn", "slow query", {
        context: "Prisma",
        durationMs: 812,
      });

      const written = String(stdout.mock.calls[0][0]);
      expect(written).toContain("WARN");
      expect(written).toContain("[Prisma]");
      expect(written).toContain("slow query");
      expect(written).toContain('{"durationMs":812}');
      expect(() => JSON.parse(written)).toThrow();
    });
  });

  describe("the request it belongs to", () => {
    it("stamps the correlation id and route on a line the caller never labelled", () => {
      // This is criterion 1's real shape: a service logs a sentence, and the id arrives anyway.
      const logger = loggerUnder(JSON_ENV);
      runInRequestContext(
        {
          correlationId: "11111111-2222-3333-4444-555555555555",
          method: "POST",
          path: "/api/v1/escrow/release",
          userId: "u-9",
          role: "ADMIN",
        },
        () => logger.log("escrow released"),
      );

      expect(linesFrom(stdout)[0]).toMatchObject({
        msg: "escrow released",
        correlationId: "11111111-2222-3333-4444-555555555555",
        method: "POST",
        path: "/api/v1/escrow/release",
        userId: "u-9",
        role: "ADMIN",
      });
    });

    it("omits the actor rather than inventing one for an anonymous request", () => {
      const logger = loggerUnder(JSON_ENV);
      runInRequestContext({ correlationId: "abc", method: "GET", path: "/api/v1/health" }, () =>
        logger.log("checked"),
      );

      const [line] = linesFrom(stdout);
      expect(line.correlationId).toBe("abc");
      expect(line).not.toHaveProperty("userId");
      expect(line).not.toHaveProperty("role");
    });

    it("still emits a line outside any request", () => {
      // Boot, shutdown and cron work have no request. They must not be silently dropped.
      loggerUnder(JSON_ENV).log("Nest application successfully started");
      const [line] = linesFrom(stdout);
      expect(line.msg).toBe("Nest application successfully started");
      expect(line).not.toHaveProperty("correlationId");
    });
  });

  describe("redaction", () => {
    it("filters caller fields before they reach the stream", () => {
      loggerUnder(JSON_ENV).write("log", "login attempt", { email: "a@b.co", password: "hunter2" });
      expect(linesFrom(stdout)[0]).toMatchObject({ email: "a@b.co", password: REDACTED });
    });

    it("filters the message itself", () => {
      loggerUnder(JSON_ENV).write("error", "payout to 0123456789 failed");
      expect(linesFrom(stderr)[0].msg).toBe("payout to [redacted:6789] failed");
    });
  });

  describe("Nest's calling conventions", () => {
    it("reads the trailing string as the context, the way Logger passes it", () => {
      loggerUnder(JSON_ENV).log("payment initialised", "PaymentsService");
      expect(linesFrom(stdout)[0]).toMatchObject({
        msg: "payment initialised",
        context: "PaymentsService",
      });
    });

    it("reads error(message, stack, context)", () => {
      loggerUnder(JSON_ENV).error("boom", "Error: boom\n    at x", "EscrowService");
      expect(linesFrom(stderr)[0]).toMatchObject({
        msg: "boom",
        stack: "Error: boom\n    at x",
        context: "EscrowService",
      });
    });

    it("unpacks an Error passed as the message", () => {
      loggerUnder(JSON_ENV).error(new TypeError("bad shape"));
      const [line] = linesFrom(stderr);
      expect(line.msg).toBe("bad shape");
      expect(line.stack).toContain("TypeError: bad shape");
    });

    it("unpacks an object message into fields", () => {
      loggerUnder(JSON_ENV).log({ msg: "money.operation start", operation: "escrow.hold", amountMinor: 5000 });
      expect(linesFrom(stdout)[0]).toMatchObject({
        msg: "money.operation start",
        operation: "escrow.hold",
        amountMinor: 5000,
      });
    });

    it("keeps an unexpected extra argument instead of dropping it", () => {
      loggerUnder(JSON_ENV).log("odd call", { detail: 1 });
      expect(linesFrom(stdout)[0].params).toEqual([{ detail: 1 }]);
    });
  });

  describe("level selection", () => {
    it("drops anything below the configured floor", () => {
      const logger = loggerUnder({ LOG_FORMAT: "json", LOG_LEVEL: "warn" });
      logger.debug("d");
      logger.log("l");
      logger.warn("w");

      expect(linesFrom(stdout).map((line) => line.level)).toEqual(["warn"]);
    });

    it("keeps quiet in the test runner unless a spec asks for output", () => {
      // Two specs build a real app with the real middleware. Without this, every assertion in the
      // suite would arrive buried in access logs.
      const logger = loggerUnder({ LOG_FORMAT: undefined, LOG_LEVEL: undefined, NODE_ENV: "test" });
      logger.error("e");
      logger.log("l");

      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
    });

    it("chooses JSON and drops debug noise in production", () => {
      const logger = loggerUnder({ LOG_FORMAT: undefined, LOG_LEVEL: undefined, NODE_ENV: "production" });
      logger.debug("d");
      logger.log("l");

      expect(stdout).toHaveBeenCalledTimes(1);
      expect(linesFrom(stdout)[0]).toMatchObject({ level: "log", msg: "l" });
    });

    it("honours Nest's own setLogLevels", () => {
      const logger = loggerUnder({ LOG_FORMAT: "json", LOG_LEVEL: "verbose" });
      logger.setLogLevels(["error", "fatal"]);
      logger.log("l");
      logger.error("e");

      expect(stdout).not.toHaveBeenCalled();
      expect(linesFrom(stderr).map((line) => line.msg)).toEqual(["e"]);
    });
  });
});
