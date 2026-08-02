import { parseFlagValue } from "../../feature-flags/feature-flags.constants";

/**
 * Every rate limit this application applies, declared once.
 *
 * Same shape as the feature flag registry next door, and for the same reason: a closed set of keys
 * means a typo does not compile, and this file is the answer to "what is limited and how hard".
 * A limit invented at the call site is a limit nobody can audit.
 *
 * The numbers here are the defaults, not the policy. Every one of them is overridable per
 * environment through THROTTLE_<KEY>, because the right ceiling for a login form is a different
 * number in a load test, in a demo to a room of people on one office address, and in production.
 * The defaults are set where a person doing the thing by hand will never notice them and a script
 * will hit them within seconds.
 */

export type ThrottlePolicyDefinition = {
  /** What this limit protects, in the words a person on call would need at 2am. */
  readonly description: string;
  /** Requests admitted per window, per client address. */
  readonly limit: number;
  /** Length of the window in seconds. */
  readonly windowSeconds: number;
};

export const THROTTLE_POLICIES = {
  global: {
    description:
      "The default every route gets without saying anything. Wide enough that a browser " +
      "loading a dashboard never sees it, narrow enough that a scraper does.",
    limit: 300,
    windowSeconds: 60,
  },
  login: {
    description:
      "POST /auth/login. The first tier of two: this one is per address and forgets itself on " +
      "restart, the lockout in login-attempts.service.ts is per account and does not.",
    limit: 10,
    windowSeconds: 60,
  },
  register: {
    description: "POST /auth/register. Sized for a person filling in a form, not for a script.",
    limit: 5,
    windowSeconds: 300,
  },
  activate: {
    description:
      "GET /auth/activate/:token and POST /auth/activate. The token is the credential here, so " +
      "the limit is what stops it being guessed at speed.",
    limit: 10,
    windowSeconds: 300,
  },
  password_reset: {
    description:
      "Password reset request and redemption. Declared ahead of the routes: E5-S3 builds them " +
      "behind the auth_recovery flag, and when it does the only thing it has to write is the " +
      "decorator. A limit that arrives after the route has already been live is a limit that was " +
      "missing exactly when it mattered.",
    limit: 5,
    windowSeconds: 900,
  },
  payment_initiate: {
    description:
      "POST /payments/initiate. Every call here starts a transaction with the gateway, so an " +
      "unbounded caller costs money and fills a table as well as burning CPU.",
    limit: 10,
    windowSeconds: 60,
  },
  guest_checkout: {
    description:
      "The whole of /guest-checkout, which is unauthenticated by design and therefore has " +
      "nothing but this in front of it.",
    limit: 10,
    windowSeconds: 300,
  },
  webhook: {
    description:
      "POST /webhooks/payments/:provider. Exempt from the login and global limits and given its " +
      "own, because Paystack retries from a small set of addresses and a burst of genuine " +
      "retries must not be mistaken for an attack. Refusing one of these strands a payment the " +
      "buyer has already made, so the ceiling is high and the signature check is what actually " +
      "guards the route.",
    limit: 240,
    windowSeconds: 60,
  },
} as const satisfies Record<string, ThrottlePolicyDefinition>;

export type ThrottlePolicyKey = keyof typeof THROTTLE_POLICIES;

export const THROTTLE_POLICY_KEYS = Object.keys(THROTTLE_POLICIES) as ThrottlePolicyKey[];

/** The policy a route gets when it declares nothing. */
export const DEFAULT_THROTTLE_POLICY: ThrottlePolicyKey = "global";

/**
 * The environment variable that sets a policy, derived rather than declared, so there is no second
 * column to forget and no way for two policies to read the same variable.
 */
export function envVarFor(key: ThrottlePolicyKey): string {
  return `THROTTLE_${key.toUpperCase()}`;
}

/**
 * Turns every limit off at once.
 *
 * This exists because the failure mode of a rate limiter is that it is wrong about who is an
 * attacker, and the person finding that out at 2am should not need a deploy to stop it. It is the
 * opposite of the feature flag kill switch in every way that matters: that one only turns things
 * off, this one only takes a protection away, and it should be set for minutes rather than left on.
 * The API says so at boot, loudly, every time it starts with this armed.
 */
export const THROTTLE_DISABLED_ENV_VAR = "THROTTLE_DISABLED";

export type ParsedThrottlePolicy = { limit: number; windowSeconds: number };

/**
 * Reads a policy out of an environment string of the form "<limit>:<windowSeconds>".
 *
 * One variable rather than two on purpose: a limit and a window are meaningless apart, and two
 * variables can be half-applied, which produces a ceiling nobody chose. Returns null for anything
 * it does not understand, so THROTTLE_LOGIN=lots is treated as unset instead of quietly becoming
 * zero, and the caller surfaces the value it dropped rather than swallowing it.
 *
 * Both numbers must be at least one. A limit of zero would refuse every request to the route,
 * which is a plausible typo with the same effect as taking the feature offline; the way to make a
 * policy stop biting is a large limit, or THROTTLE_DISABLED for all of them at once.
 */
export function parsePolicyValue(raw: string | undefined): ParsedThrottlePolicy | null {
  const value = raw?.trim();
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const limit = Number(parts[0]);
  const windowSeconds = Number(parts[1]);
  if (!Number.isInteger(limit) || !Number.isInteger(windowSeconds)) return null;
  if (limit < 1 || windowSeconds < 1) return null;
  return { limit, windowSeconds };
}

export type ThrottlePolicySource = "env" | "default";

export type ResolvedThrottlePolicy = ParsedThrottlePolicy & {
  key: ThrottlePolicyKey;
  source: ThrottlePolicySource;
  envVar: string;
  description: string;
  /**
   * Present when the variable is set to something unparseable, which means it is being ignored.
   * Without this the operator who typed THROTTLE_LOGIN=100 sees the default and concludes the
   * variable does not work.
   */
  envValueIgnored?: string;
};

export function resolvePolicy(
  key: ThrottlePolicyKey,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedThrottlePolicy {
  const definition = THROTTLE_POLICIES[key];
  const envVar = envVarFor(key);
  const raw = env[envVar];
  const parsed = parsePolicyValue(raw);
  const ignored = raw?.trim() && parsed === null ? raw.trim() : undefined;

  const base = {
    key,
    envVar,
    description: definition.description,
    ...(ignored === undefined ? {} : { envValueIgnored: ignored }),
  };

  if (parsed) return { ...base, ...parsed, source: "env" };
  return {
    ...base,
    limit: definition.limit,
    windowSeconds: definition.windowSeconds,
    source: "default",
  };
}

export function resolveAllPolicies(
  env: NodeJS.ProcessEnv = process.env,
): Map<ThrottlePolicyKey, ResolvedThrottlePolicy> {
  return new Map(THROTTLE_POLICY_KEYS.map((key) => [key, resolvePolicy(key, env)]));
}

export function isThrottleDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseFlagValue(env[THROTTLE_DISABLED_ENV_VAR]) === true;
}
