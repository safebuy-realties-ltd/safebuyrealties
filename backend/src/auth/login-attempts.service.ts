import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { TooManyRequestsException } from "../common/throttle/too-many-requests.exception";

/**
 * The second tier of E5-S1: progressive lockout on repeated failed logins, per account and per
 * source address, and unlike the request throttle it survives a restart.
 *
 * **It survives without a migration.** The counter is the audit log, which already exists, already
 * has `@@index([entity, entityId])`, and has `action` as a plain `String` column rather than an
 * enum, so a new action value costs nothing at the database. This repository shares one cloud
 * Postgres between local development, previews and production, so a migration is a scheduled event
 * with the client rather than part of a story; a durable counter that needs no schema change is
 * therefore the difference between shipping this now and shipping it after a maintenance window.
 * The rows are worth having on their own account: "when did this account start being attacked" is a
 * question the audit log should be able to answer.
 *
 * **The keys are hashes, and both of the reasons matter.** The email is whatever an unauthenticated
 * caller typed, so storing it raw would let anyone write chosen text into the audit table, and it
 * would put the email addresses of people who do not have accounts here into a table that keeps
 * things. Hashing also makes the lock indistinguishable for an account that exists and one that
 * does not: the key is derived from the submitted string, the check runs before the user lookup, and
 * the response is byte for byte the same either way. A lockout that only triggers on real accounts
 * is an account enumeration oracle with a delay built in.
 *
 * **This can be used to lock a person out of their own account**, by anyone who knows their email.
 * That is inherent in per-account lockout and the mitigation is the shape of the ladder rather than
 * its absence: the first lock is a minute, the worst is half an hour, none of them is permanent and
 * none of them needs an administrator to lift. The attacker also has to get past the per-address
 * request throttle to produce the failures in the first place, and that one bites them and not the
 * victim.
 */

/** Everything this service writes and reads sits under one entity, so one index serves it. */
export const AUTH_ATTEMPT_ENTITY = "AuthAttempt";

export type LockoutTier = { failures: number; lockSeconds: number };

/**
 * Per account. Five wrong passwords in an hour is a person who has forgotten which one they used;
 * twenty is not. The ladder climbs so that the honest case costs a minute and the scripted case
 * costs enough to make the script pointless.
 */
export const ACCOUNT_LOCKOUT_TIERS: readonly LockoutTier[] = [
  { failures: 5, lockSeconds: 60 },
  { failures: 10, lockSeconds: 300 },
  { failures: 20, lockSeconds: 1800 },
];

/**
 * Per source address, and deliberately looser. One address can be a whole office behind one
 * outbound gateway, or a mobile network, so the thresholds that would be right for one person are
 * wrong here. This tier catches the attacker who is spreading across many accounts from one place,
 * which the per-account ladder cannot see at all.
 */
export const ADDRESS_LOCKOUT_TIERS: readonly LockoutTier[] = [
  { failures: 20, lockSeconds: 60 },
  { failures: 40, lockSeconds: 300 },
  { failures: 80, lockSeconds: 1800 },
];

/** How far back a failure still counts. Older than this and the account starts clean. */
export const ATTEMPT_WINDOW_SECONDS = 3600;

/**
 * Most recent attempts examined per login.
 *
 * Bounded because this query runs on the login path: it has to be enough to see past the worst
 * threshold on both ladders, and no more. Eighty failures is the top of the address ladder, and
 * beyond that the answer is "locked" whatever the exact number is.
 */
const SCAN_LIMIT = 200;

export type AttemptCount = {
  /** Failures since the last success, within the window. */
  failures: number;
  /** When the lock lifts, or null when this key is not locked. */
  lockedUntil: Date | null;
};

export type AttemptState = {
  account: AttemptCount;
  address: AttemptCount;
  /** The later of the two locks, or null when neither is locked. */
  lockedUntil: Date | null;
  retryAfterSeconds: number;
};

type AttemptRow = { entityId: string; action: string; createdAt: Date };

@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Key for an account. Case and surrounding space are normalised first, as the lookup is. */
  accountKey(email: string): string {
    return `account:${sha256(email.trim().toLowerCase())}`;
  }

  /** Key for a source address. Hashed for the same reasons, and because an address is personal data. */
  addressKey(ip: string | undefined): string {
    return `address:${sha256(ip?.trim() || "unknown")}`;
  }

  /**
   * Reads the state of both keys in one query.
   *
   * One round trip rather than two because this sits in front of every login, including the ones
   * that succeed. The rows come back newest first and are walked until a success is found, so a
   * successful sign-in clears the count without deleting anything: the audit log stays append-only,
   * which is the property that makes it worth reading later.
   *
   * A database that cannot answer this is treated as no failures. That is the deliberate direction:
   * `AuditService.log` already swallows its write failures, so a database in trouble cannot record
   * attempts either, and a lockout built on counts it cannot read would refuse every login in the
   * product rather than the attacker's. When this tier is blind the request throttle is still up,
   * which is why there are two of them.
   */
  async check(email: string, ip: string | undefined): Promise<AttemptState> {
    const accountKey = this.accountKey(email);
    const addressKey = this.addressKey(ip);
    const since = new Date(Date.now() - ATTEMPT_WINDOW_SECONDS * 1000);

    let rows: AttemptRow[] = [];
    try {
      rows = await this.prisma.auditLog.findMany({
        where: {
          entity: AUTH_ATTEMPT_ENTITY,
          entityId: { in: [accountKey, addressKey] },
          action: { in: [AuditAction.LOGIN_FAILED, AuditAction.LOGIN_SUCCEEDED] },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        select: { entityId: true, action: true, createdAt: true },
        take: SCAN_LIMIT,
      });
    } catch (err) {
      this.logger.warn(
        `Could not read login attempts, so lockout is not being applied to this request. The ` +
          `request throttle still is. ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const account = countFor(rows, accountKey, ACCOUNT_LOCKOUT_TIERS);
    const address = countFor(rows, addressKey, ADDRESS_LOCKOUT_TIERS);
    const lockedUntil = laterOf(account.lockedUntil, address.lockedUntil);
    return {
      account,
      address,
      lockedUntil,
      retryAfterSeconds: lockedUntil ? secondsUntil(lockedUntil) : 0,
    };
  }

  /**
   * Refuses the request when either key is locked.
   *
   * Called before the user is looked up, so the answer does not depend on whether the account
   * exists, and before the password is compared, so a locked account costs no bcrypt round.
   */
  assertNotLocked(state: AttemptState): void {
    if (!state.lockedUntil) return;
    throw new TooManyRequestsException(
      `Too many failed sign-in attempts. Try again in ${state.retryAfterSeconds} seconds.`,
      state.retryAfterSeconds,
    );
  }

  /**
   * Records one failed attempt against both keys, and the moment a lock starts.
   *
   * The lock row is written once, on the failure that crosses a threshold, and not on the refusals
   * that follow it. Attempts are rows an unauthenticated caller causes, so the count of them has to
   * be bounded by something: it is bounded by the lock itself, because once locked this method is
   * never reached again until the lock lifts.
   */
  async recordFailure(
    email: string,
    ip: string | undefined,
    state: AttemptState,
    actorId: string | null,
  ): Promise<void> {
    const accountKey = this.accountKey(email);
    const addressKey = this.addressKey(ip);
    await Promise.all([
      this.audit.log({
        actorId,
        action: AuditAction.LOGIN_FAILED,
        entity: AUTH_ATTEMPT_ENTITY,
        entityId: accountKey,
        ipAddress: ip ?? null,
      }),
      this.audit.log({
        actorId,
        action: AuditAction.LOGIN_FAILED,
        entity: AUTH_ATTEMPT_ENTITY,
        entityId: addressKey,
        ipAddress: ip ?? null,
      }),
    ]);

    await Promise.all([
      this.recordLockIfCrossed(
        accountKey,
        state.account.failures + 1,
        ACCOUNT_LOCKOUT_TIERS,
        ip,
        actorId,
      ),
      this.recordLockIfCrossed(
        addressKey,
        state.address.failures + 1,
        ADDRESS_LOCKOUT_TIERS,
        ip,
        actorId,
      ),
    ]);
  }

  /**
   * Records a successful sign-in, which is what clears the counters.
   *
   * `check` stops counting at the newest success, so this row is the reset. It is not a
   * `LOGIN_FAILED` row deleted, because nothing here deletes: the history of an attacked account
   * remains readable after its owner gets back in.
   */
  async recordSuccess(email: string, ip: string | undefined, actorId: string): Promise<void> {
    await Promise.all([
      this.audit.log({
        actorId,
        action: AuditAction.LOGIN_SUCCEEDED,
        entity: AUTH_ATTEMPT_ENTITY,
        entityId: this.accountKey(email),
        ipAddress: ip ?? null,
      }),
      this.audit.log({
        actorId,
        action: AuditAction.LOGIN_SUCCEEDED,
        entity: AUTH_ATTEMPT_ENTITY,
        entityId: this.addressKey(ip),
        ipAddress: ip ?? null,
      }),
    ]);
  }

  private async recordLockIfCrossed(
    entityId: string,
    failures: number,
    tiers: readonly LockoutTier[],
    ip: string | undefined,
    actorId: string | null,
  ): Promise<void> {
    const crossed = tiers.find((tier) => tier.failures === failures);
    if (!crossed) return;
    await this.audit.log({
      actorId,
      action: AuditAction.LOGIN_LOCKED_OUT,
      entity: AUTH_ATTEMPT_ENTITY,
      entityId,
      after: { failures, lockSeconds: crossed.lockSeconds },
      ipAddress: ip ?? null,
    });
    this.logger.warn(
      `Sign-in locked for ${crossed.lockSeconds}s after ${failures} failed attempts. ` +
        `Key ${entityId}, which is a hash: neither the address nor the account is in this line.`,
    );
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Walks one key's rows newest first, stopping at the first success.
 *
 * The lock runs from the newest failure rather than from the one that crossed the threshold, so a
 * caller that keeps trying keeps the lock alive for its full length from the last attempt instead of
 * waiting out a clock that started earlier.
 */
function countFor(
  rows: AttemptRow[],
  entityId: string,
  tiers: readonly LockoutTier[],
): AttemptCount {
  let failures = 0;
  let newestFailure: Date | null = null;
  for (const row of rows) {
    if (row.entityId !== entityId) continue;
    if (row.action === AuditAction.LOGIN_SUCCEEDED) break;
    failures += 1;
    if (!newestFailure) newestFailure = row.createdAt;
  }

  const tier = highestTierReached(failures, tiers);
  if (!tier || !newestFailure) return { failures, lockedUntil: null };

  const lockedUntil = new Date(newestFailure.getTime() + tier.lockSeconds * 1000);
  return { failures, lockedUntil: lockedUntil > new Date() ? lockedUntil : null };
}

function highestTierReached(failures: number, tiers: readonly LockoutTier[]): LockoutTier | null {
  let reached: LockoutTier | null = null;
  for (const tier of tiers) {
    if (failures >= tier.failures) reached = tier;
  }
  return reached;
}

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function secondsUntil(when: Date): number {
  return Math.max(1, Math.ceil((when.getTime() - Date.now()) / 1000));
}
