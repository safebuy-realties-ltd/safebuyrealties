import { Prisma, TransactionStatus } from "@prisma/client";
import { KYC_BLOCK_CODE, KYC_GATED_ACTIONS, KYC_GATE_FLAG, kycRequiredFor } from "../kyc/kyc-gate";
import { KycStatus } from "../kyc/kyc.constants";
import type { FeatureFlagKey, FeatureFlagReader } from "../feature-flags/feature-flags.constants";

/**
 * The include both callers pass, so neither can read a fact the other cannot see.
 *
 * It is here rather than in either service for the same reason the rule is: the serializer that
 * decides whether to show a button and the payments service that decides whether to take money have
 * to be looking at the same row.
 */
export const PURCHASE_FACTS_INCLUDE = {
  dueDiligenceOrder: { select: { verdict: true } },
  buyer: { select: { kycRecord: { select: { status: true } } } },
} satisfies Prisma.TransactionInclude;

/**
 * The verdicts an operator can sign a due diligence case off with.
 *
 * The column is a free-form string in the schema and the three values are documented above it at
 * `backend/prisma/schema.prisma`. They are named here because a money path should not compare
 * against a string literal typed at the call site.
 */
export const DD_VERDICT = {
  PROCEED: "PROCEED",
  PROCEED_WITH_CAUTION: "PROCEED_WITH_CAUTION",
  DO_NOT_PROCEED: "DO_NOT_PROCEED",
} as const;

/** Why a buyer cannot purchase, in a form the browser can branch on without reading prose. */
export const PURCHASE_BLOCK = {
  FEATURE_OFF: "FEATURE_OFF",
  DUE_DILIGENCE_UNFINISHED: "DUE_DILIGENCE_UNFINISHED",
  VERDICT_AGAINST: "VERDICT_AGAINST",
  // The same string the API refuses with when a buyer posts to the endpoint anyway, taken from the
  // gate rather than typed again, so the browser needs one branch and not two.
  KYC_REQUIRED: KYC_BLOCK_CODE,
  ALREADY_IN_ESCROW: "ALREADY_IN_ESCROW",
  TRANSACTION_CLOSED: "TRANSACTION_CLOSED",
} as const;

export type PurchaseBlockCode = (typeof PURCHASE_BLOCK)[keyof typeof PURCHASE_BLOCK];

/**
 * Everything the decision depends on, gathered by the caller.
 *
 * Passing facts rather than a Prisma row keeps the rule readable and keeps the two callers honest:
 * the serializer that decides whether to show a button and the payments service that decides whether
 * to take money both hand over the same five values, so they cannot reach different conclusions.
 */
export type PurchaseFacts = {
  /** Where the transaction is now. */
  status: TransactionStatus;
  /** The signed-off verdict on the due diligence case, or null when there is no case or no verdict. */
  verdict: string | null;
  /** The buyer's KYC record status, or NOT_SUBMITTED when they have no record at all. */
  kycStatus: string;
  /** The `property_purchase` flag. Off means the whole step is not offered. */
  featureEnabled: boolean;
  /** Whether the KYC registry demands a verified identity to pay for a property, gate armed and all. */
  kycEnforced: boolean;
};

export type PurchaseReadiness = {
  canPurchase: boolean;
  blockedBy: PurchaseBlockCode | null;
  /** Why not, in the buyer's words. Null when they can purchase. */
  reason: string | null;
  /** A warning that does not block. Set alongside a purchase that is allowed but qualified. */
  caution: string | null;
};

/**
 * As much of a transaction row as the decision reads.
 *
 * Both callers load the case and the buyer's KYC record alongside the transaction they were already
 * fetching, so the rule costs no extra query and a list of fifty transactions does not become a
 * hundred and fifty round trips.
 */
export type PurchaseFactRow = {
  status: TransactionStatus;
  dueDiligenceOrder?: { verdict: string | null } | null;
  buyer?: { kycRecord?: { status: string } | null } | null;
};

/** The two flags the decision reads, named so a caller cannot pass them the wrong way round. */
export type PurchaseFlags = {
  featureEnabled: boolean;
  kycEnforced: boolean;
};

/**
 * The two flag keys the purchase step reads, written down once.
 *
 * Both callers resolve the same pair, and a typo in one of them would not fail a build or a test: an
 * unknown key reads as off, so the serializer would quietly stop offering the button, or worse, the
 * payments service would quietly stop enforcing KYC. Naming them here and typing them as
 * `FeatureFlagKey` makes a mistyped key a compile error instead.
 */
export const PURCHASE_FLAG_KEYS = {
  feature: "property_purchase",
  kyc: KYC_GATE_FLAG,
} as const satisfies Record<string, FeatureFlagKey>;

/** Whatever can answer a flag. Re-exported from where it now lives, so existing importers hold. */
export type { FeatureFlagReader };

/** Resolves both flags in one place, so the two callers cannot read a different pair. */
export function purchaseFlagsFrom(flags: FeatureFlagReader): PurchaseFlags {
  return {
    featureEnabled: flags.isEnabled(PURCHASE_FLAG_KEYS.feature),
    // Asked of the KYC policy rather than read off the flag directly. The flag arms the gate; the
    // registry at `kyc/kyc-gate.ts` decides that paying for a property is one of the things it bites
    // on. Reading the flag here would make this file a second opinion on that.
    kycEnforced: kycRequiredFor("PROPERTY_PURCHASE", flags),
  };
}

/** Reads the facts off a loaded row, with the absences spelled out rather than left undefined. */
export function purchaseFactsFrom(row: PurchaseFactRow, flags: PurchaseFlags): PurchaseFacts {
  return {
    status: row.status,
    verdict: row.dueDiligenceOrder?.verdict ?? null,
    // No record at all and a record that was never submitted are the same thing to this rule, and
    // saying so here keeps the rule itself free of null handling.
    kycStatus: row.buyer?.kycRecord?.status ?? KycStatus.NOT_SUBMITTED,
    featureEnabled: flags.featureEnabled,
    kycEnforced: flags.kycEnforced,
  };
}

/** The statuses a purchase may be started from. */
export const PURCHASE_READY_STATUSES: readonly TransactionStatus[] = [
  TransactionStatus.DD_COMPLETE,
  TransactionStatus.PURCHASE_PENDING,
];

/**
 * Whether this buyer may buy this property right now, decided in one place.
 *
 * There are two callers and they need the same answer for opposite reasons. The browser asks so it
 * knows whether to render the purchase button, and hiding a button is a courtesy rather than a
 * control. The payments service asks so it knows whether to create a payment, and that one is the
 * control. Computing the rule twice is how a hidden button ends up in front of an open endpoint, so
 * the rule is computed once here and both of them read the result.
 *
 * `PURCHASE_PENDING` is a legal starting point as well as `DD_COMPLETE`. A buyer who opened a
 * checkout and closed the tab is sitting there with no payment and no escrow row, and the only
 * useful thing to offer them is the button again.
 */
export function evaluatePurchaseReadiness(facts: PurchaseFacts): PurchaseReadiness {
  const blocked = (blockedBy: PurchaseBlockCode, reason: string): PurchaseReadiness => ({
    canPurchase: false,
    blockedBy,
    reason,
    caution: null,
  });

  if (!facts.featureEnabled) {
    return blocked(PURCHASE_BLOCK.FEATURE_OFF, "Property purchase is not available yet.");
  }
  if (facts.status === TransactionStatus.COMPLETED) {
    return blocked(
      PURCHASE_BLOCK.TRANSACTION_CLOSED,
      "This purchase has completed and the property has been released to you.",
    );
  }
  if (facts.status === TransactionStatus.PURCHASE_IN_ESCROW) {
    return blocked(
      PURCHASE_BLOCK.ALREADY_IN_ESCROW,
      "Your payment for this property is already held in escrow.",
    );
  }
  if (!PURCHASE_READY_STATUSES.includes(facts.status)) {
    return blocked(
      PURCHASE_BLOCK.DUE_DILIGENCE_UNFINISHED,
      "Due diligence on this property has not been signed off yet, so it cannot be purchased.",
    );
  }
  if (facts.verdict === DD_VERDICT.DO_NOT_PROCEED) {
    return blocked(
      PURCHASE_BLOCK.VERDICT_AGAINST,
      "Due diligence returned a verdict of do not proceed on this property. " +
        "Purchase is blocked. Read the report, and speak to us if you believe this is wrong.",
    );
  }
  // E1-S4 wired this clause and E4-S2 gave it a policy behind it. `kycEnforced` is now the KYC
  // registry's answer for PROPERTY_PURCHASE rather than the raw flag, and the sentence the buyer
  // reads is the registry's too, so the button and the endpoint refuse in the same words.
  if (facts.kycEnforced && facts.kycStatus !== KycStatus.VERIFIED) {
    return blocked(PURCHASE_BLOCK.KYC_REQUIRED, KYC_GATED_ACTIONS.PROPERTY_PURCHASE.blockedReason);
  }

  return {
    canPurchase: true,
    blockedBy: null,
    reason: null,
    caution:
      facts.verdict === DD_VERDICT.PROCEED_WITH_CAUTION
        ? "Due diligence returned a verdict of proceed with caution. " +
          "Read the report before you pay."
        : null,
  };
}
