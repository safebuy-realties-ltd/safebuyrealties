import { AuditAction } from "../audit/audit-actions.constants";
import { TooManyRequestsException } from "../common/throttle/too-many-requests.exception";
import {
  ACCOUNT_LOCKOUT_TIERS,
  ADDRESS_LOCKOUT_TIERS,
  AUTH_ATTEMPT_ENTITY,
  LoginAttemptsService,
} from "./login-attempts.service";

const EMAIL = "victim@test.com";
const IP = "203.0.113.7";

describe("LoginAttemptsService", () => {
  let findMany: jest.Mock;
  let log: jest.Mock;
  let service: LoginAttemptsService;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    log = jest.fn().mockResolvedValue(undefined);
    service = new LoginAttemptsService({ auditLog: { findMany } } as never, { log } as never);
  });

  /** Rows as the real query returns them: newest first. */
  function failures(entityId: string, count: number, secondsAgoOfNewest = 0) {
    return Array.from({ length: count }, (_unused, i) => ({
      entityId,
      action: AuditAction.LOGIN_FAILED,
      createdAt: new Date(Date.now() - (secondsAgoOfNewest + i) * 1000),
    }));
  }

  describe("the keys", () => {
    it("hashes the account, so nothing an unauthenticated caller typed lands in the table", () => {
      const key = service.accountKey(EMAIL);
      expect(key).toMatch(/^account:[0-9a-f]{64}$/);
      expect(key).not.toContain(EMAIL);
      expect(key).not.toContain("victim");
    });

    it("hashes the address for the same reason, and because an address is personal data", () => {
      const key = service.addressKey(IP);
      expect(key).toMatch(/^address:[0-9a-f]{64}$/);
      expect(key).not.toContain(IP);
    });

    it("normalises case and space the same way the account lookup does", () => {
      expect(service.accountKey("  VICTIM@test.com ")).toBe(service.accountKey(EMAIL));
    });

    it("keeps a missing address in one bucket rather than throwing it away", () => {
      expect(service.addressKey(undefined)).toBe(service.addressKey("  "));
    });

    it("cannot collide an account key with an address key", () => {
      expect(service.accountKey(EMAIL)).not.toBe(service.addressKey(EMAIL));
    });
  });

  describe("check", () => {
    it("reads both keys in one round trip, bounded and windowed", async () => {
      await service.check(EMAIL, IP);

      expect(findMany).toHaveBeenCalledTimes(1);
      const query = findMany.mock.calls[0][0];
      expect(query.where.entity).toBe(AUTH_ATTEMPT_ENTITY);
      expect(query.where.entityId.in).toEqual([service.accountKey(EMAIL), service.addressKey(IP)]);
      expect(query.where.createdAt.gte).toBeInstanceOf(Date);
      expect(query.take).toBeGreaterThan(
        ADDRESS_LOCKOUT_TIERS[ADDRESS_LOCKOUT_TIERS.length - 1].failures,
      );
    });

    it("starts a clean account at zero and unlocked", async () => {
      const state = await service.check(EMAIL, IP);

      expect(state.account.failures).toBe(0);
      expect(state.lockedUntil).toBeNull();
      expect(state.retryAfterSeconds).toBe(0);
    });

    it("stays unlocked one failure short of the first tier", async () => {
      const first = ACCOUNT_LOCKOUT_TIERS[0];
      findMany.mockResolvedValue(failures(service.accountKey(EMAIL), first.failures - 1));

      const state = await service.check(EMAIL, IP);

      expect(state.account.failures).toBe(first.failures - 1);
      expect(state.lockedUntil).toBeNull();
    });

    it("locks on the failure that reaches the first tier", async () => {
      const first = ACCOUNT_LOCKOUT_TIERS[0];
      findMany.mockResolvedValue(failures(service.accountKey(EMAIL), first.failures));

      const state = await service.check(EMAIL, IP);

      expect(state.lockedUntil).toBeInstanceOf(Date);
      expect(state.retryAfterSeconds).toBeGreaterThan(0);
      expect(state.retryAfterSeconds).toBeLessThanOrEqual(first.lockSeconds);
    });

    it("climbs the ladder, so a script pays more than a person who forgot a password", async () => {
      const top = ACCOUNT_LOCKOUT_TIERS[ACCOUNT_LOCKOUT_TIERS.length - 1];
      findMany.mockResolvedValue(failures(service.accountKey(EMAIL), top.failures));

      const state = await service.check(EMAIL, IP);

      expect(state.retryAfterSeconds).toBeGreaterThan(ACCOUNT_LOCKOUT_TIERS[0].lockSeconds);
      expect(state.retryAfterSeconds).toBeLessThanOrEqual(top.lockSeconds);
    });

    it("runs the lock from the newest failure, so carrying on keeps it alive", async () => {
      const first = ACCOUNT_LOCKOUT_TIERS[0];
      // Every failure older than the lock length. The lock has expired and the account is usable.
      findMany.mockResolvedValue(
        failures(service.accountKey(EMAIL), first.failures, first.lockSeconds + 5),
      );

      const state = await service.check(EMAIL, IP);

      expect(state.account.failures).toBe(first.failures);
      expect(state.lockedUntil).toBeNull();
    });

    it("treats a success as the reset, without deleting the history behind it", async () => {
      const accountKey = service.accountKey(EMAIL);
      findMany.mockResolvedValue([
        { entityId: accountKey, action: AuditAction.LOGIN_SUCCEEDED, createdAt: new Date() },
        ...failures(accountKey, ACCOUNT_LOCKOUT_TIERS[0].failures, 10),
      ]);

      const state = await service.check(EMAIL, IP);

      expect(state.account.failures).toBe(0);
      expect(state.lockedUntil).toBeNull();
    });

    it("counts the address ladder separately and looser than the account one", async () => {
      const accountFirst = ACCOUNT_LOCKOUT_TIERS[0];
      // Enough to lock an account, nowhere near enough to lock an address. An office behind one
      // outbound gateway must not be shut out by one person mistyping a password.
      findMany.mockResolvedValue(failures(service.addressKey(IP), accountFirst.failures));

      const state = await service.check(EMAIL, IP);

      expect(state.address.failures).toBe(accountFirst.failures);
      expect(state.lockedUntil).toBeNull();
      expect(ADDRESS_LOCKOUT_TIERS[0].failures).toBeGreaterThan(accountFirst.failures);
    });

    it("locks the address once its own threshold is reached", async () => {
      const first = ADDRESS_LOCKOUT_TIERS[0];
      findMany.mockResolvedValue(failures(service.addressKey(IP), first.failures));

      const state = await service.check(EMAIL, IP);

      expect(state.address.lockedUntil).toBeInstanceOf(Date);
      expect(state.lockedUntil).toBeInstanceOf(Date);
    });

    it("answers identically for an account that exists and one that does not", async () => {
      // Nothing in this path touches the user table, so the two are the same call with the same
      // cost. A lockout that only fires on real accounts is an enumeration oracle.
      findMany.mockResolvedValue(
        failures(service.addressKey(IP), ADDRESS_LOCKOUT_TIERS[0].failures),
      );

      const real = await service.check(EMAIL, IP);
      const fake = await service.check("nobody-at-all@test.com", IP);

      expect(fake.lockedUntil).not.toBeNull();
      expect(fake.address).toEqual(real.address);
      expect(fake.account.failures).toBe(real.account.failures);
    });

    it("fails open on this tier when the database cannot answer", async () => {
      findMany.mockRejectedValue(new Error("connection refused"));

      const state = await service.check(EMAIL, IP);

      // The request throttle is still up. A lockout built on counts it cannot read would refuse
      // every login in the product rather than the attacker's.
      expect(state.account.failures).toBe(0);
      expect(state.lockedUntil).toBeNull();
    });
  });

  describe("assertNotLocked", () => {
    it("passes an unlocked state through", async () => {
      const state = await service.check(EMAIL, IP);
      expect(() => service.assertNotLocked(state)).not.toThrow();
    });

    it("refuses a locked one with the seconds to wait", async () => {
      findMany.mockResolvedValue(
        failures(service.accountKey(EMAIL), ACCOUNT_LOCKOUT_TIERS[0].failures),
      );
      const state = await service.check(EMAIL, IP);

      let thrown: TooManyRequestsException | undefined;
      try {
        service.assertNotLocked(state);
      } catch (err) {
        thrown = err as TooManyRequestsException;
      }

      expect(thrown).toBeInstanceOf(TooManyRequestsException);
      const body = thrown?.getResponse() as { details: { retryAfterSeconds: number } };
      expect(body.details.retryAfterSeconds).toBe(state.retryAfterSeconds);
    });
  });

  describe("recordFailure", () => {
    it("counts the attempt against both keys", async () => {
      const state = await service.check(EMAIL, IP);
      await service.recordFailure(EMAIL, IP, state, null);

      const written = log.mock.calls.map((call) => call[0]);
      expect(written).toHaveLength(2);
      expect(written.map((row) => row.entityId).sort()).toEqual(
        [service.accountKey(EMAIL), service.addressKey(IP)].sort(),
      );
      expect(written.every((row) => row.action === AuditAction.LOGIN_FAILED)).toBe(true);
    });

    it("never puts the submitted email anywhere in the row", async () => {
      const state = await service.check(EMAIL, IP);
      await service.recordFailure(EMAIL, IP, state, null);

      expect(JSON.stringify(log.mock.calls)).not.toContain(EMAIL);
    });

    it("marks the moment a lock starts, once, on the failure that crosses the tier", async () => {
      const first = ACCOUNT_LOCKOUT_TIERS[0];
      findMany.mockResolvedValue(failures(service.accountKey(EMAIL), first.failures - 1));
      const state = await service.check(EMAIL, IP);

      await service.recordFailure(EMAIL, IP, state, "u1");

      const locks = log.mock.calls
        .map((call) => call[0])
        .filter((row) => row.action === AuditAction.LOGIN_LOCKED_OUT);
      expect(locks).toHaveLength(1);
      expect(locks[0]).toMatchObject({
        entityId: service.accountKey(EMAIL),
        after: { failures: first.failures, lockSeconds: first.lockSeconds },
      });
    });

    it("writes no lock row on a failure that crosses nothing", async () => {
      const state = await service.check(EMAIL, IP);
      await service.recordFailure(EMAIL, IP, state, null);

      const locks = log.mock.calls
        .map((call) => call[0])
        .filter((row) => row.action === AuditAction.LOGIN_LOCKED_OUT);
      expect(locks).toHaveLength(0);
    });
  });

  describe("recordSuccess", () => {
    it("clears both counts by appending rather than deleting", async () => {
      await service.recordSuccess(EMAIL, IP, "u1");

      const written = log.mock.calls.map((call) => call[0]);
      expect(written).toHaveLength(2);
      expect(written.every((row) => row.action === AuditAction.LOGIN_SUCCEEDED)).toBe(true);
      expect(written.every((row) => row.actorId === "u1")).toBe(true);
    });
  });
});
