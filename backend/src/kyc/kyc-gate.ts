import { HttpException, HttpStatus } from "@nestjs/common";
import type {
  FeatureFlagKey,
  FeatureFlagReader,
} from "../feature-flags/feature-flags.constants";
import { KycStatus } from "./kyc.constants";

/** The one flag the whole gate hangs off. Off means no action requires anything of anybody. */
export const KYC_GATE_FLAG = "kyc_gate" satisfies FeatureFlagKey;

/**
 * The code a refusal carries, and the code the purchase button already reports.
 *
 * `PURCHASE_BLOCK.KYC_REQUIRED` is this same constant, so a browser that knows how to handle one
 * knows how to handle the other. Two spellings of the same refusal would mean two code paths in the
 * frontend and a coin toss over which one a given surface used.
 */
export const KYC_BLOCK_CODE = "KYC_REQUIRED";

export type KycActionDefinition = {
  /** What the action is, for whoever is reading this registry to decide whether to gate theirs. */
  readonly description: string;
  /** Whether an armed gate demands VERIFIED before this action may proceed. */
  readonly requiresVerified: boolean;
  /** Why it was refused, in the buyer's words. Shown to them, so it says what to do next. */
  readonly blockedReason: string;
  /** The story that owns this row, which is who to ask when the answer looks wrong. */
  readonly story: string;
};

/**
 * Which actions require a verified identity, written down in one place.
 *
 * The gate is not "KYC on or off for everything". Some steps have to stay open or the funnel never
 * starts, and some must not, or the platform moves money for someone it cannot name. So each action
 * declares its own answer here, next to the reason a buyer will read when it refuses them, and the
 * services that perform those actions ask this registry rather than deciding for themselves.
 *
 * The line the MVP draws is deliberate. Due diligence is the step that earns the trust, and demanding
 * identity documents before a buyer has seen anything of value is how you lose the buyer. Everything
 * downstream of it moves real money or signs a real instrument, and those are worth an identity.
 *
 * Changing which actions are gated is a change to policy on a money path, so it is a change to this
 * file and a review, not an environment variable typed at 2am. What can be done without a deploy is
 * the thing worth doing without a deploy: turning the gate off, through `kyc_gate`.
 */
export const KYC_GATED_ACTIONS = {
  DUE_DILIGENCE_PURCHASE: {
    description: "Paying for a due diligence report on a listing.",
    requiresVerified: false,
    blockedReason:
      "Your identity verification needs to be approved before you can order due diligence.",
    story: "E4-S2",
  },
  PROPERTY_PURCHASE: {
    description: "Paying the property price into escrow.",
    requiresVerified: true,
    blockedReason:
      "Your identity verification needs to be approved before you can pay for a property.",
    story: "E4-S2",
  },
  POA_EXECUTION: {
    description: "Executing the Power of Attorney that lets us act on a buyer's behalf.",
    requiresVerified: true,
    blockedReason:
      "Your identity verification needs to be approved before you can execute a Power of Attorney.",
    story: "E4-S2",
  },
  SELLER_PAYOUT_ACCOUNT: {
    description: "Verifying the bank account a seller's proceeds are paid out to.",
    requiresVerified: true,
    blockedReason:
      "Your identity verification needs to be approved before you can verify a payout account.",
    // Declared, not wired. E2-S1 builds the payout destination and calls the gate on the way in;
    // until then there is no surface to gate and nothing here reaches a request. It is written down
    // now so that story finds the policy already made rather than making a second one.
    story: "E2-S1",
  },
} as const satisfies Record<string, KycActionDefinition>;

export type KycAction = keyof typeof KYC_GATED_ACTIONS;

export const KYC_ACTIONS = Object.keys(KYC_GATED_ACTIONS) as KycAction[];

/** Where the answer came from. Reported alongside it, because "not required" alone is not an answer. */
export type KycRequirementSource = "flag-off" | "registry";

export type KycActionPolicy = {
  action: KycAction;
  /** Whether VERIFIED is demanded right now, which is the registry and the flag together. */
  requiresVerified: boolean;
  source: KycRequirementSource;
  description: string;
  story: string;
  /** The flag that arms this, so the reader does not have to know which one it is. */
  flag: FeatureFlagKey;
};

/**
 * What the policy asks of one action right now.
 *
 * The source matters as much as the answer. An action reading "not required" because the gate is
 * disarmed and one reading it because the registry says so look identical to a caller and mean
 * opposite things to an operator about to turn the gate on.
 */
export function describeKycAction(action: KycAction, flags: FeatureFlagReader): KycActionPolicy {
  const definition = KYC_GATED_ACTIONS[action];
  const armed = flags.isEnabled(KYC_GATE_FLAG);
  return {
    action,
    requiresVerified: armed && definition.requiresVerified,
    source: armed ? "registry" : "flag-off",
    description: definition.description,
    story: definition.story,
    flag: KYC_GATE_FLAG,
  };
}

/** The one question most callers have. */
export function kycRequiredFor(action: KycAction, flags: FeatureFlagReader): boolean {
  return describeKycAction(action, flags).requiresVerified;
}

export type KycGateDecision = {
  action: KycAction;
  /** Whether the action may proceed. */
  allowed: boolean;
  /** Whether the policy demanded VERIFIED at all, which is not the same as whether it was met. */
  requiresVerified: boolean;
  /** The status the decision was taken on, carried so the refusal can say it. */
  kycStatus: string;
  /** Why not, in the buyer's words. Null when allowed. */
  reason: string | null;
};

/**
 * Whether this buyer may take this action right now.
 *
 * Only VERIFIED passes. A record sitting in review is not a lesser kind of verified, it is an
 * unanswered question, and a gate that let it through would be a gate that anyone clears by
 * uploading a file.
 */
export function evaluateKycGate(
  action: KycAction,
  kycStatus: string,
  flags: FeatureFlagReader,
): KycGateDecision {
  const policy = describeKycAction(action, flags);
  const allowed = !policy.requiresVerified || kycStatus === KycStatus.VERIFIED;
  return {
    action,
    allowed,
    requiresVerified: policy.requiresVerified,
    kycStatus,
    reason: allowed ? null : KYC_GATED_ACTIONS[action].blockedReason,
  };
}

/**
 * The gate as a service calls it: one line, before the work, that either returns or refuses.
 *
 * Hiding a button is a courtesy. This is the control, and it lives on the path the request actually
 * takes, so a buyer holding a URL gets the same answer as a buyer looking at the screen.
 */
export function assertKycGate(
  action: KycAction,
  kycStatus: string,
  flags: FeatureFlagReader,
): void {
  const decision = evaluateKycGate(action, kycStatus, flags);
  if (!decision.allowed) {
    throw new KycRequiredException(action, decision.kycStatus);
  }
}

/**
 * A refusal the browser can act on rather than only display.
 *
 * 403 rather than 401: the caller is authenticated and known, they are simply not cleared for this
 * one thing, and a 401 would send the frontend to a login screen they are already past. The details
 * name the action and the status so the KYC screen can say what is being unblocked and how far along
 * the verification already is.
 */
export class KycRequiredException extends HttpException {
  constructor(action: KycAction, kycStatus: string) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: KYC_BLOCK_CODE,
        message: KYC_GATED_ACTIONS[action].blockedReason,
        details: { action, kycStatus },
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
