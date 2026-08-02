import { CanActivate, ExecutionContext, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SKIP_THROTTLE_METADATA, THROTTLE_POLICY_METADATA } from "../decorators/throttle.decorator";
import { ThrottleStore } from "../throttle/throttle-store";
import { TooManyRequestsException } from "../throttle/too-many-requests.exception";
import {
  DEFAULT_THROTTLE_POLICY,
  isThrottleDisabled,
  resolveAllPolicies,
  THROTTLE_DISABLED_ENV_VAR,
  type ResolvedThrottlePolicy,
  type ThrottlePolicyKey,
} from "../throttle/throttle.constants";

/** What a request looks like to this guard. Deliberately not the body: see below. */
type ThrottledRequest = { ip?: string; method?: string; url?: string };

/**
 * Enforces the rate limits, mounted globally so a story author writes one decorator and nothing
 * else. Registered in `app.module.ts` beside `MaintenanceGuard` and `FeatureGuard`.
 *
 * A route with no `@Throttle` on it gets the global policy, which is wide. A route with
 * `@SkipThrottle()` costs two `Reflector` lookups and passes.
 *
 * **The key is the caller's address and the policy, and nothing else.** This guard never reads the
 * request body, so there is no path by which a submitted password or email reaches a counter, a log
 * line or a key. That is criterion 5 discharged by construction rather than by remembering to
 * redact: the guard cannot leak a credential it was never given.
 *
 * `req.ip` is only the caller's address if Express has been told how many proxies sit in front of
 * it, which `configureApp` does from `TRUST_PROXY_HOPS`. Without that every request behind Render's
 * proxy carries the proxy's address, every caller lands in one bucket, and the first person to hit
 * the login limit locks out everybody. See src/config/trust-proxy.ts.
 */
@Injectable()
export class ThrottleGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(ThrottleGuard.name);
  private readonly store = new ThrottleStore();
  private readonly policies = resolveAllPolicies();
  private readonly disabled = isThrottleDisabled();

  constructor(private readonly reflector: Reflector) {}

  /**
   * Says out loud, once, what the process booted believing.
   *
   * Anything moved off its default is worth a line, anything set to a value that was not understood
   * is worth a warning, and running with the limits switched off is worth saying every time,
   * because that is the state somebody meant to leave for ten minutes.
   */
  onModuleInit(): void {
    if (this.disabled) {
      this.logger.warn(
        `${THROTTLE_DISABLED_ENV_VAR} is set: every rate limit is off and no route is throttled.`,
      );
    }
    for (const policy of this.policies.values()) {
      if (policy.envValueIgnored !== undefined) {
        this.logger.warn(
          `${policy.envVar}="${policy.envValueIgnored}" is not a value this reads, so it is being ` +
            `ignored and ${policy.key} stays at ${policy.limit} per ${policy.windowSeconds}s. ` +
            `Use "<limit>:<windowSeconds>", e.g. "10:60".`,
        );
      } else if (policy.source === "env") {
        this.logger.log(
          `${policy.key} is limited to ${policy.limit} per ${policy.windowSeconds}s by ${policy.envVar}.`,
        );
      }
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.disabled) return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(SKIP_THROTTLE_METADATA, targets)) {
      return true;
    }

    const key =
      this.reflector.getAllAndOverride<ThrottlePolicyKey | undefined>(
        THROTTLE_POLICY_METADATA,
        targets,
      ) ?? DEFAULT_THROTTLE_POLICY;
    const policy = this.policies.get(key);
    // Unreachable while the decorator is typed against the registry, and cheaper than the argument
    // about whether it is: an unknown policy admits the request rather than refusing everything.
    if (!policy) return true;

    const req = context.switchToHttp().getRequest<ThrottledRequest>();
    const decision = this.store.hit(
      `${key}:${req.ip ?? "unknown"}`,
      policy.limit,
      policy.windowSeconds,
    );
    if (decision.allowed) return true;

    // Once per key per window, not once per rejected request. A flood that trips this limit would
    // otherwise write a log line per request, which is the same flood pointed at the log drain.
    if (decision.count === policy.limit + 1) {
      this.logger.warn(
        `Rate limit ${policy.key} reached (${policy.limit} per ${policy.windowSeconds}s) for ` +
          `${req.method ?? "?"} ${req.url ?? "?"}. Further requests on this key are refused for ` +
          `${decision.retryAfterSeconds}s and will not be logged again this window.`,
      );
    }

    throw new TooManyRequestsException(
      this.message(policy, decision.retryAfterSeconds),
      decision.retryAfterSeconds,
    );
  }

  /** No echo of anything the caller sent, and no count, which would tell a prober where it stands. */
  private message(policy: ResolvedThrottlePolicy, retryAfterSeconds: number): string {
    return policy.key === DEFAULT_THROTTLE_POLICY
      ? `Too many requests. Try again in ${retryAfterSeconds} seconds.`
      : `Too many requests to this endpoint. Try again in ${retryAfterSeconds} seconds.`;
  }
}
