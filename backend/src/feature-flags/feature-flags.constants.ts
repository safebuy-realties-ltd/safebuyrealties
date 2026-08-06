/**
 * Every feature flag this application knows about, declared once.
 *
 * The registry is deliberately a closed set rather than a free-form string map. A flag system where
 * any caller can invent a key at the call site produces two failures that are hard to see: a typo
 * reads as "off" forever, and a flag outlives the story that needed it because nothing lists what
 * exists. Here the key is a TypeScript union, so a typo does not compile, and this file is the list.
 *
 * The keys are not invented here either. Nine of them come straight out of the Flag column of the
 * story index in docs/MVP_OUTSTANDING_BACKLOG.md, which has named them since before there was
 * anything to read them. The tenth, standalone_dd_public_order_read, is operational rather than
 * roadmap: it is the switch on a route that is already live.
 */

export type FeatureFlagDefinition = {
  /** What the flag actually gates, in the words a person on call would need at 2am. */
  readonly description: string;
  /** The value when no environment variable and no override says otherwise. */
  readonly defaultEnabled: boolean;
  /**
   * Whether the browser is told this flag exists.
   *
   * False keeps a flag server-only. A flag name is not a secret, but the set of names is a map of
   * what is being built and what is currently switched off, and an operational kill switch in
   * particular should not be discoverable by anyone who opens the network tab.
   */
  readonly client: boolean;
  /** The backlog row that owns it, so a flag with no story left is visibly ready to delete. */
  readonly story: string;
};

export const FEATURE_FLAGS = {
  financial_governance: {
    description:
      "Everything built on the FinGov chart of accounts: the ID register, the main accounts and " +
      "their sub-ledgers, and the postings that will sit on top of them. Declared here by E9-S1, " +
      "which ships the tables and nothing that reads them, so that the two-gate policy is visible " +
      "in the diff rather than promised in a description. SBR-FIN-DEV-SPEC-20260803-V1.5 is " +
      "approved for implementation and not for production activation, per its section 14.2, so " +
      "this flag stays off until the second gate closes.",
    defaultEnabled: false,
    client: true,
    story: "E9-S1, E9-S2, E9-S3",
  },
  dd_case_lifecycle: {
    description: "The listing due diligence case lifecycle: queue, assignment, report, completion.",
    defaultEnabled: false,
    client: true,
    story: "E1-S1, E1-S2, E1-S3",
  },
  property_purchase: {
    description: "The property purchase step wired to the transaction state machine.",
    defaultEnabled: false,
    client: true,
    story: "E1-S4",
  },
  payouts: {
    description: "Seller payout destinations and gateway refunds, both of which move real money.",
    defaultEnabled: false,
    client: true,
    story: "E2-S1, E2-S3",
  },
  secure_docs: {
    description:
      "Upload hardening: type allow-list, magic bytes, antivirus hook. Authorized document " +
      "access shipped in E3-S1 before this flag system existed and is not gated by it, so " +
      "turning this off does not reopen the public document route.",
    defaultEnabled: false,
    client: true,
    story: "E3-S3",
  },
  kyc_gate: {
    description: "The KYC gate in front of money-moving actions.",
    defaultEnabled: false,
    client: true,
    story: "E4-S2",
  },
  auth_recovery: {
    description: "Password reset, from the request form through to the token redemption.",
    defaultEnabled: false,
    client: true,
    story: "E5-S3",
  },
  auth_signup: {
    description: "Email verification on self-registration.",
    defaultEnabled: false,
    client: true,
    story: "E5-S4",
  },
  auth_sessions: {
    description: "Refresh token rotation and session revocation.",
    defaultEnabled: false,
    client: true,
    story: "E5-S5",
  },
  email_notifications: {
    description: "Email as a delivery channel for notifications, and the templates behind it.",
    defaultEnabled: false,
    client: true,
    story: "E6-S2, E6-S3",
  },
  privacy_centre: {
    description: "NDPR consent, retention and erasure, and the self-service privacy centre.",
    defaultEnabled: false,
    client: true,
    story: "E8-S1",
  },
  standalone_dd_public_order_read: {
    description:
      "GET /standalone-dd/orders/:serviceId, which reads a due diligence order for anyone " +
      "holding the id and checks nothing. Turning this off returns 404 to every caller, " +
      "including the guest who just paid, so it costs the guest receipt view. It exists so an " +
      "operator can close that route in seconds while the product decision is pending, rather " +
      "than waiting for a deploy.",
    defaultEnabled: true,
    client: false,
    story: "E4-S3 finding, open",
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return Object.hasOwn(FEATURE_FLAGS, value);
}

/**
 * Whatever can answer a flag.
 *
 * Structural rather than the service itself, so a rule that depends on a flag stays a pure function
 * and its spec can pass a two-line stub instead of standing up a testing module. `FeatureFlagsService`
 * satisfies it without being told to.
 */
export type FeatureFlagReader = { isEnabled(key: FeatureFlagKey): boolean };

/**
 * The environment variable that sets a flag, derived rather than declared.
 *
 * Deriving it means the registry cannot disagree with the deployment: there is no second column to
 * forget to update, and no way to end up with two flags reading the same variable.
 */
export function envVarFor(key: FeatureFlagKey): string {
  return `FEATURE_${key.toUpperCase()}`;
}

/** Arms the kill switch for the whole process, durably, across every instance. */
export const KILL_SWITCH_ENV_VAR = "FEATURE_FLAGS_KILL_SWITCH";

const TRUTHY = new Set(["true", "1", "yes", "on", "enabled"]);
const FALSY = new Set(["false", "0", "no", "off", "disabled"]);

/**
 * Reads a flag value out of an environment string.
 *
 * Returns null for anything it does not recognise, including the empty string, so that
 * FEATURE_PAYOUTS=maybe is treated as unset instead of quietly meaning false. The caller surfaces
 * the ignored value rather than swallowing it, because a flag that did not take effect and said
 * nothing is worse than one that was never set.
 */
export function parseFlagValue(raw: string | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  return null;
}
