import { SetMetadata } from "@nestjs/common";
import type { ThrottlePolicyKey } from "../throttle/throttle.constants";

export const THROTTLE_POLICY_METADATA = "throttlePolicy";
export const SKIP_THROTTLE_METADATA = "skipThrottle";

/**
 * Puts a route under a named rate limit instead of the global default.
 *
 * Usable on a handler or on a whole controller, and the handler wins, which is how a controller can
 * carry one policy while one route inside it answers to another.
 *
 * The key is typed against the registry, so a route cannot be limited by a policy nobody declared
 * and a misspelled policy is a compile error rather than a route that quietly falls back to the
 * global ceiling.
 */
export const Throttle = (policy: ThrottlePolicyKey) =>
  SetMetadata(THROTTLE_POLICY_METADATA, policy);

/**
 * Takes a route out of rate limiting entirely.
 *
 * There is one use for this and it is the health probes. Render calls `/health/live` and
 * `/health/ready` on a schedule from the platform's own addresses, which behind a proxy are a
 * handful of addresses shared with everything else it runs. A liveness probe that gets a 429 is a
 * probe that failed, and enough failed probes is a restart: the rate limiter would have taken the
 * service down by defending it. Nothing behind these routes touches user data and `/health` has
 * been unauthenticated and exempt from the maintenance guard since before this existed.
 */
export const SkipThrottle = () => SetMetadata(SKIP_THROTTLE_METADATA, true);
