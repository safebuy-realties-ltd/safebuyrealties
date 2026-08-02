/**
 * The counter behind the first tier of rate limiting: fixed windows, in this process, in memory.
 *
 * **It does not survive a restart, and that is the honest trade rather than an oversight.** A
 * durable counter for a sixty second window would mean a write to the shared cloud Postgres on
 * every request to every route, which turns a defence against load into a source of it. What a
 * restart actually costs an attacker is one window: the process comes back with empty counters, and
 * the next sixty seconds of abuse are counted again from zero. The thing a restart must not reset
 * is the failed-login count, and that one is durable, in login-attempts.service.ts, backed by the
 * audit log. Two tiers, two failure modes, neither of them total.
 *
 * Fixed windows rather than sliding ones, for the same reason: a sliding window needs a timestamp
 * per request, a fixed one needs a count and a deadline. The known weakness is the boundary, where
 * a caller can spend a full limit at the end of one window and another at the start of the next.
 * At these ceilings that is a factor of two on a number chosen with a factor of ten of headroom.
 */

export type ThrottleDecision = {
  allowed: boolean;
  /** Requests seen in this window including the one being decided. */
  count: number;
  limit: number;
  /** Whole seconds until the window resets. At least 1, because Retry-After: 0 means "now". */
  retryAfterSeconds: number;
};

type Window = { count: number; resetAt: number };

/**
 * How many distinct keys are held before the store starts making room.
 *
 * A rate limiter keyed on the caller's address is a map an unfriendly caller gets to add rows to,
 * so it needs a ceiling or it is itself the denial of service. Fifty thousand entries is a few
 * megabytes and is more distinct addresses per minute than this application will see outside an
 * attack it cannot absorb anyway.
 */
const DEFAULT_MAX_KEYS = 50_000;

export class ThrottleStore {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly maxKeys: number = DEFAULT_MAX_KEYS) {}

  /**
   * Counts one request against a key and says whether to admit it.
   *
   * `now` is a parameter rather than a call to Date.now() inside so that a test can walk a window
   * forwards without sleeping through it.
   */
  hit(
    key: string,
    limit: number,
    windowSeconds: number,
    now: number = Date.now(),
  ): ThrottleDecision {
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.makeRoom(now);
      const resetAt = now + windowSeconds * 1000;
      this.windows.set(key, { count: 1, resetAt });
      return { allowed: true, count: 1, limit, retryAfterSeconds: secondsUntil(resetAt, now) };
    }

    existing.count += 1;
    return {
      allowed: existing.count <= limit,
      count: existing.count,
      limit,
      retryAfterSeconds: secondsUntil(existing.resetAt, now),
    };
  }

  /** Entries currently held. Exposed for the boot log and for the tests, not for a decision. */
  size(): number {
    return this.windows.size;
  }

  /** Drops every counter. Used by tests; nothing in the running application calls it. */
  clear(): void {
    this.windows.clear();
  }

  /**
   * Keeps the map under its ceiling before a new key goes in.
   *
   * Expired windows go first, which in normal traffic is all it ever has to do and costs nothing
   * because it only runs at the ceiling. If sweeping frees nothing then every window held is live,
   * and one has to go: the oldest inserted, which under a single window length is also the one
   * closest to expiring. That caller gets its count reset, which is a bypass of exactly one window
   * for one key, chosen over the alternative of an unbounded map.
   */
  private makeRoom(now: number): void {
    if (this.windows.size < this.maxKeys) return;

    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
    if (this.windows.size < this.maxKeys) return;

    const oldest = this.windows.keys().next();
    if (!oldest.done) this.windows.delete(oldest.value);
  }
}

function secondsUntil(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}
