/**
 * E5-S5. One test file per acceptance criterion, plus the token itself.
 *
 * The store is a small in-memory stand-in for `auditLog` rather than a per-call jest mock, because
 * every interesting thing this service does is a read of something it wrote earlier: rotation reads
 * the hash it stored, reuse detection reads the hash it replaced, revocation is read back by the next
 * request. A mock that answers each call in isolation would prove the calls happened and nothing
 * about whether a spent token still works, which is the only question that matters here.
 */
import { UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { SessionsService, describeDevice } from "./sessions.service";
import { AuditAction } from "../audit/audit-actions.constants";
import {
  AUTH_SESSION_ENTITY,
  DEFAULT_REFRESH_TOKEN_TTL_DAYS,
  REFRESH_FAILURE_MESSAGE,
} from "./sessions.constants";

type Row = {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  after: unknown;
  ipAddress: string | null;
  createdAt: Date;
  seq: number;
};

function matches(row: Row, where: Record<string, unknown>): boolean {
  const asRecord = row as unknown as Record<string, unknown>;
  return Object.entries(where).every(([key, value]) => asRecord[key] === value);
}

class FakeAuditLog {
  rows: Row[] = [];
  private seq = 0;

  create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    this.seq += 1;
    const row: Row = {
      id: `row-${this.seq}`,
      actorId: (data.actorId as string | undefined) ?? null,
      action: data.action as string,
      entity: data.entity as string,
      entityId: data.entityId as string,
      after: data.after ?? null,
      ipAddress: (data.ipAddress as string | undefined) ?? null,
      createdAt: new Date(),
      seq: this.seq,
    };
    this.rows.push(row);
    return row;
  });

  findFirst = jest.fn(
    async ({ where }: { where: Record<string, unknown> }) =>
      this.rows.find((row) => matches(row, where)) ?? null,
  );

  findMany = jest.fn(async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
    const found = this.rows.filter((row) => matches(row, where)).sort((a, b) => b.seq - a.seq);
    return typeof take === "number" ? found.slice(0, take) : found;
  });

  update = jest.fn(async ({ where, data }: { where: { id: string }; data: { after: unknown } }) => {
    const row = this.rows.find((candidate) => candidate.id === where.id);
    if (!row) throw new Error(`No such row: ${where.id}`);
    row.after = data.after;
    return row;
  });
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("SessionsService", () => {
  let store: FakeAuditLog;
  let audit: { log: jest.Mock };
  let flags: { isEnabled: jest.Mock };
  let config: { get: jest.Mock };
  let service: SessionsService;

  /** The session row as it stands right now, which is what rotation and revocation both move. */
  const stateOf = (familyId: string) => {
    const row = store.rows.find(
      (candidate) =>
        candidate.entityId === familyId && candidate.action === AuditAction.SESSION_ISSUED,
    );
    return row?.after as Record<string, unknown> | undefined;
  };

  const secretOf = (token: string) => token.slice(token.indexOf(".") + 1);

  beforeEach(() => {
    store = new FakeAuditLog();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    flags = { isEnabled: jest.fn().mockReturnValue(true) };
    config = { get: jest.fn().mockReturnValue(undefined) };
    service = new SessionsService(
      { auditLog: store } as never,
      audit as never,
      flags as never,
      config as never,
    );
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("criterion 1: short access token, rotating refresh token", () => {
    it("hands back a refresh token that lives a week by default", async () => {
      const before = Date.now();
      const session = await service.issue({ userId: "u1" });

      const days = (session.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(DEFAULT_REFRESH_TOKEN_TTL_DAYS);
      expect(session.refreshToken.startsWith(`${session.familyId}.`)).toBe(true);
    });

    it("takes REFRESH_TOKEN_TTL_DAYS when it is set to something sane", async () => {
      config.get.mockImplementation((key: string) =>
        key === "REFRESH_TOKEN_TTL_DAYS" ? "2" : undefined,
      );
      const before = Date.now();

      const session = await service.issue({ userId: "u1" });

      const days = (session.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(2);
    });

    it("ignores a REFRESH_TOKEN_TTL_DAYS that is not a positive number", async () => {
      config.get.mockImplementation((key: string) =>
        key === "REFRESH_TOKEN_TTL_DAYS" ? "not-a-number" : undefined,
      );
      const before = Date.now();

      const session = await service.issue({ userId: "u1" });

      const days = (session.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(DEFAULT_REFRESH_TOKEN_TTL_DAYS);
    });

    it("gives two sign-ins two unrelated tokens", async () => {
      const first = await service.issue({ userId: "u1" });
      const second = await service.issue({ userId: "u1" });

      expect(first.familyId).not.toBe(second.familyId);
      expect(first.refreshToken).not.toBe(second.refreshToken);
    });
  });

  describe("criterion 2: hashed at rest, rotated on use, reuse kills the family", () => {
    it("stores the hash and never the token", async () => {
      const session = await service.issue({ userId: "u1" });
      const state = stateOf(session.familyId);

      expect(state?.tokenHash).toBe(sha256(secretOf(session.refreshToken)));
      // Said plainly, because the reason for hashing is that the table is not a set of live
      // credentials for whoever ends up reading it.
      expect(JSON.stringify(store.rows)).not.toContain(secretOf(session.refreshToken));
    });

    it("replaces the token on every use and refuses the one just spent", async () => {
      const session = await service.issue({ userId: "u1" });

      const rotated = await service.rotate(session.refreshToken, {});

      expect(rotated.refreshToken).not.toBe(session.refreshToken);
      expect(rotated.familyId).toBe(session.familyId);
      expect(rotated.userId).toBe("u1");
      expect(stateOf(session.familyId)?.generation).toBe(2);
      expect(stateOf(session.familyId)?.tokenHash).toBe(sha256(secretOf(rotated.refreshToken)));
    });

    it("does not extend the session when it rotates", async () => {
      const session = await service.issue({ userId: "u1" });

      const rotated = await service.rotate(session.refreshToken, {});

      // A session that renewed itself on every refresh would never end, which is the same as having
      // no expiry at all for anyone who keeps a tab open.
      expect(rotated.expiresAt.toISOString()).toBe(session.expiresAt.toISOString());
    });

    it("revokes the whole family and raises an alert when a spent token comes back", async () => {
      const session = await service.issue({ userId: "u1" });
      const rotated = await service.rotate(session.refreshToken, {});
      // A minute after the rotation, which is well outside the leeway window. Back-dated rather
      // than waited for, and back-dated on the stored row rather than by moving the clock, because
      // this is the one branch where the elapsed time is the whole decision.
      const state = stateOf(session.familyId) as Record<string, unknown>;
      state.rotatedAt = new Date(Date.now() - 60_000).toISOString();

      await expect(
        service.rotate(session.refreshToken, { ipAddress: "203.0.113.9" }),
      ).rejects.toThrow(REFRESH_FAILURE_MESSAGE);

      expect(stateOf(session.familyId)?.revokedAt).toEqual(expect.any(String));
      expect(stateOf(session.familyId)?.revokedReason).toBe("token_reuse");
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.SESSION_REUSE_DETECTED,
          entity: AUTH_SESSION_ENTITY,
          entityId: session.familyId,
        }),
      );
      // The point of killing the family rather than the token: whoever holds the good token now is
      // as likely to be the thief as the owner, so neither of them keeps it.
      await expect(service.rotate(rotated.refreshToken, {})).rejects.toThrow(
        REFRESH_FAILURE_MESSAGE,
      );
      expect(await service.isLive(session.familyId)).toBe(false);
    });

    it("clears both hashes when it revokes, leaving nothing to match against later", async () => {
      const session = await service.issue({ userId: "u1" });
      await service.rotate(session.refreshToken, {});

      await service.revoke("u1", session.familyId, "user_revoked");

      expect(stateOf(session.familyId)?.tokenHash).toBe("");
      expect(stateOf(session.familyId)?.previousTokenHash).toBeNull();
    });

    it("treats the previous token inside the leeway window as a race rather than an attack", async () => {
      const session = await service.issue({ userId: "u1" });
      const rotated = await service.rotate(session.refreshToken, {});

      // A second tab woke up holding the token the first tab had just spent. It is refused, because
      // that token is genuinely gone, but the family survives.
      await expect(service.rotate(session.refreshToken, {})).rejects.toThrow(
        REFRESH_FAILURE_MESSAGE,
      );
      expect(stateOf(session.familyId)?.revokedAt).toBeNull();
      expect(audit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.SESSION_REUSE_DETECTED }),
      );
      await expect(service.rotate(rotated.refreshToken, {})).resolves.toBeDefined();
    });
  });

  describe("criterion 3: listing and ending sessions", () => {
    it("lists live sessions with a device label and marks the one asking", async () => {
      const laptop = await service.issue({
        userId: "u1",
        ipAddress: "203.0.113.7",
        userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit Chrome/120.0 Safari/537",
      });
      const phone = await service.issue({
        userId: "u1",
        userAgent: "Mozilla/5.0 (iPhone) AppleWebKit Safari/604",
      });

      const sessions = await service.list("u1", phone.familyId);

      expect(sessions.map((s) => s.id)).toEqual([phone.familyId, laptop.familyId]);
      expect(sessions[0].current).toBe(true);
      expect(sessions[0].device).toBe("Safari on iOS");
      expect(sessions[1].current).toBe(false);
      expect(sessions[1].device).toBe("Chrome on macOS");
      expect(sessions[1].ipAddress).toBe("203.0.113.7");
      expect(sessions[1].lastSeenAt).toEqual(expect.any(String));
    });

    it("drops a session from the list the moment it is revoked", async () => {
      const session = await service.issue({ userId: "u1" });

      expect(await service.revoke("u1", session.familyId, "user_revoked")).toBe(true);

      expect(await service.list("u1")).toEqual([]);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.SESSION_REVOKED,
          entityId: session.familyId,
        }),
      );
    });

    it("will not let one user end another user's session", async () => {
      const mine = await service.issue({ userId: "u1" });

      // Answered exactly as a session id that never existed, so this is not a way to find out which
      // ids are real.
      expect(await service.revoke("u2", mine.familyId, "user_revoked")).toBe(false);
      expect(
        await service.revoke("u2", "00000000-0000-4000-8000-000000000000", "user_revoked"),
      ).toBe(false);
      expect(stateOf(mine.familyId)?.revokedAt).toBeNull();
    });

    it("says no rather than yes twice when a session is revoked again", async () => {
      const session = await service.issue({ userId: "u1" });
      await service.revoke("u1", session.familyId, "user_revoked");

      expect(await service.revoke("u1", session.familyId, "user_revoked")).toBe(false);
    });

    it("ends the session a refresh token belongs to, which is what logout has", async () => {
      const session = await service.issue({ userId: "u1" });

      expect(await service.revokePresented(session.refreshToken, "logout")).toBe(true);
      expect(await service.isLive(session.familyId)).toBe(false);
    });

    it("ignores a logout that presents a family id without its secret", async () => {
      const session = await service.issue({ userId: "u1" });

      expect(await service.revokePresented(`${session.familyId}.notthesecretatall`, "logout")).toBe(
        false,
      );
      expect(await service.isLive(session.familyId)).toBe(true);
    });
  });

  describe("criterion 4: events that end every other session", () => {
    it("ends all of a user's sessions and leaves other users alone", async () => {
      const first = await service.issue({ userId: "u1" });
      const second = await service.issue({ userId: "u1" });
      const other = await service.issue({ userId: "u2" });

      expect(await service.revokeAllForUser("u1", "kyc_rejected")).toBe(2);

      expect(await service.isLive(first.familyId)).toBe(false);
      expect(await service.isLive(second.familyId)).toBe(false);
      expect(await service.isLive(other.familyId)).toBe(true);
      expect(stateOf(first.familyId)?.revokedReason).toBe("kyc_rejected");
    });

    it("can spare the session doing the asking", async () => {
      const keep = await service.issue({ userId: "u1" });
      const drop = await service.issue({ userId: "u1" });

      expect(
        await service.revokeAllForUser("u1", "password_changed", { exceptFamilyId: keep.familyId }),
      ).toBe(1);

      expect(await service.isLive(keep.familyId)).toBe(true);
      expect(await service.isLive(drop.familyId)).toBe(false);
    });

    it("writes nothing and counts nothing when there was nothing to end", async () => {
      expect(await service.revokeAllForUser("u-nobody", "password_changed")).toBe(0);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe("criterion 5: one refusal, whatever went wrong", () => {
    const cases: Array<[string, () => Promise<unknown>]> = [];

    it("answers expired, revoked, fabricated and malformed identically", async () => {
      const expired = await service.issue({ userId: "u1" });
      const expiredState = stateOf(expired.familyId) as Record<string, unknown>;
      expiredState.expiresAt = new Date(Date.now() - 1000).toISOString();

      const revoked = await service.issue({ userId: "u1" });
      await service.revoke("u1", revoked.familyId, "user_revoked");

      cases.push(
        ["expired", () => service.rotate(expired.refreshToken, {})],
        ["revoked", () => service.rotate(revoked.refreshToken, {})],
        [
          "fabricated",
          () => service.rotate("00000000-0000-4000-8000-000000000000.aaaaaaaaaaaaaaaaaaaa", {}),
        ],
        ["malformed", () => service.rotate("not-a-token", {})],
        ["empty", () => service.rotate("", {})],
      );

      for (const [label, attempt] of cases) {
        const error = await attempt().then(
          () => null,
          (err: unknown) => err,
        );
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).message).toBe(REFRESH_FAILURE_MESSAGE);
        expect(label).toBeTruthy();
      }
    });

    it("does not touch the database for a token that cannot be a token", async () => {
      await expect(service.rotate("not-a-token", {})).rejects.toThrow(REFRESH_FAILURE_MESSAGE);

      // Shape is checked before the family id reaches a query, so junk costs a caller nothing and
      // costs the database nothing either.
      expect(store.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("criterion 6: the flag", () => {
    it("follows auth_sessions on every call rather than caching it", () => {
      flags.isEnabled.mockReturnValue(false);
      expect(service.enabled()).toBe(false);

      flags.isEnabled.mockReturnValue(true);
      expect(service.enabled()).toBe(true);
      expect(flags.isEnabled).toHaveBeenCalledWith("auth_sessions");
    });
  });

  describe("isLive", () => {
    it("is true for a fresh session and false for one that has run out", async () => {
      const session = await service.issue({ userId: "u1" });
      expect(await service.isLive(session.familyId)).toBe(true);

      const state = stateOf(session.familyId) as Record<string, unknown>;
      state.expiresAt = new Date(Date.now() - 1000).toISOString();
      expect(await service.isLive(session.familyId)).toBe(false);
    });

    it("is false for a session id nobody ever issued", async () => {
      expect(await service.isLive("00000000-0000-4000-8000-000000000000")).toBe(false);
    });

    it("is not confused by the revocation note sitting on the same entity id", async () => {
      const session = await service.issue({ userId: "u1" });
      // The alert rows share `entity` and `entityId` with the session they are about. A lookup that
      // did not pin the action would find one of them and read a session out of a note.
      store.rows.push({
        id: "note-1",
        actorId: "u1",
        action: AuditAction.SESSION_REVOKED,
        entity: AUTH_SESSION_ENTITY,
        entityId: session.familyId,
        after: { reason: "user_revoked" },
        ipAddress: null,
        createdAt: new Date(),
        seq: 999,
      });

      expect(await service.isLive(session.familyId)).toBe(true);
      expect((await service.list("u1")).map((s) => s.id)).toEqual([session.familyId]);
    });
  });

  describe("describeDevice", () => {
    it.each([
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Safari/604.1", "Safari on iOS"],
      ["Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120.0 Safari/537.36", "Chrome on Windows"],
      [
        "Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120.0 Safari/537.36 Edg/120.0",
        "Edge on Windows",
      ],
      ["Mozilla/5.0 (X11; Linux x86_64) Gecko Firefox/121.0", "Firefox on Linux"],
      ["curl/8.4.0", "Unknown browser on Unknown"],
    ])("labels %s", (userAgent, expected) => {
      expect(describeDevice(userAgent)).toBe(expected);
    });

    it("says so when there is no user agent at all", () => {
      expect(describeDevice(null)).toBe("Unknown device");
      expect(describeDevice("")).toBe("Unknown device");
    });

    it("bounds the string before any pattern runs over it", () => {
      // Caller-supplied and unbounded, and every pattern here scans the whole string.
      expect(describeDevice(`${"A".repeat(50_000)} Chrome/120.0`)).toBe(
        "Unknown browser on Unknown",
      );
    });
  });
});
