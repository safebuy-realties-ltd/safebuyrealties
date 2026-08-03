import { TransactionStatus } from "@prisma/client";
import { KycStatus } from "../kyc/kyc.constants";
import {
  DD_VERDICT,
  PURCHASE_BLOCK,
  PURCHASE_FLAG_KEYS,
  PURCHASE_READY_STATUSES,
  evaluatePurchaseReadiness,
  purchaseFactsFrom,
  purchaseFlagsFrom,
  type PurchaseFacts,
} from "./purchase-readiness";

/**
 * E1-S4. The purchase rule is one function with no database and no Nest around it, so this walks it
 * exhaustively rather than sampling it.
 *
 * The reason for the exhaustive walk is criterion 1. "Appears only when the transaction is
 * DD_COMPLETE and the buyer's KYC allows it" is a claim about every status, not about the two that
 * are convenient to test, and the way that claim breaks in practice is a new status arriving in the
 * schema and nobody deciding what it means here.
 */

const ALL_STATUSES = Object.values(TransactionStatus);

const ready: PurchaseFacts = {
  status: TransactionStatus.DD_COMPLETE,
  verdict: DD_VERDICT.PROCEED,
  kycStatus: KycStatus.VERIFIED,
  featureEnabled: true,
  kycEnforced: true,
};

describe("evaluatePurchaseReadiness", () => {
  describe("criterion 1: which statuses may start a purchase", () => {
    it("allows exactly the two statuses the story names, and no others", () => {
      const allowed = ALL_STATUSES.filter(
        (status) => evaluatePurchaseReadiness({ ...ready, status }).canPurchase,
      );

      expect(allowed).toEqual([TransactionStatus.DD_COMPLETE, TransactionStatus.PURCHASE_PENDING]);
      expect(allowed).toEqual([...PURCHASE_READY_STATUSES]);
    });

    it("offers the button again to a buyer who opened a checkout and closed the tab", () => {
      // PURCHASE_PENDING with no escrow row is a buyer sitting on nothing. Refusing them here would
      // strand them, because there is no other way back to a checkout.
      const result = evaluatePurchaseReadiness({
        ...ready,
        status: TransactionStatus.PURCHASE_PENDING,
      });

      expect(result.canPurchase).toBe(true);
    });

    it("says due diligence is unfinished rather than staying silent, on every earlier status", () => {
      const earlier = [
        TransactionStatus.INITIATED,
        TransactionStatus.IN_PROGRESS,
        TransactionStatus.DD_PURCHASED,
        TransactionStatus.DD_IN_PROGRESS,
      ];

      for (const status of earlier) {
        const result = evaluatePurchaseReadiness({ ...ready, status });
        expect(result.blockedBy).toBe(PURCHASE_BLOCK.DUE_DILIGENCE_UNFINISHED);
        expect(result.reason).toMatch(/due diligence/i);
      }
    });

    it("distinguishes money already held from a purchase that has closed", () => {
      expect(
        evaluatePurchaseReadiness({ ...ready, status: TransactionStatus.PURCHASE_IN_ESCROW })
          .blockedBy,
      ).toBe(PURCHASE_BLOCK.ALREADY_IN_ESCROW);
      expect(
        evaluatePurchaseReadiness({ ...ready, status: TransactionStatus.COMPLETED }).blockedBy,
      ).toBe(PURCHASE_BLOCK.TRANSACTION_CLOSED);
    });
  });

  describe("criterion 6: a verdict of concern", () => {
    it("blocks on do not proceed and gives the buyer the reason", () => {
      const result = evaluatePurchaseReadiness({ ...ready, verdict: DD_VERDICT.DO_NOT_PROCEED });

      expect(result.canPurchase).toBe(false);
      expect(result.blockedBy).toBe(PURCHASE_BLOCK.VERDICT_AGAINST);
      expect(result.reason).toMatch(/do not proceed/i);
      expect(result.caution).toBeNull();
    });

    it("warns on proceed with caution without taking the decision away from the buyer", () => {
      // The deliberate line in this story. A caution is a fact about the property that the buyer is
      // entitled to weigh; refusing their money over it would be us making their decision for them.
      const result = evaluatePurchaseReadiness({
        ...ready,
        verdict: DD_VERDICT.PROCEED_WITH_CAUTION,
      });

      expect(result.canPurchase).toBe(true);
      expect(result.blockedBy).toBeNull();
      expect(result.caution).toMatch(/proceed with caution/i);
    });

    it("carries no caution on a clean verdict", () => {
      expect(evaluatePurchaseReadiness(ready).caution).toBeNull();
    });

    it("blocks the verdict before it asks about KYC", () => {
      // Order matters in the answer the buyer reads. Being told to fix their identity documents on a
      // property due diligence has already refused would send them to the wrong place.
      const result = evaluatePurchaseReadiness({
        ...ready,
        verdict: DD_VERDICT.DO_NOT_PROCEED,
        kycStatus: KycStatus.NOT_SUBMITTED,
      });

      expect(result.blockedBy).toBe(PURCHASE_BLOCK.VERDICT_AGAINST);
    });
  });

  describe("criterion 1: what KYC allows", () => {
    it("admits only a verified buyer while the gate is armed", () => {
      const admitted = Object.values(KycStatus).filter(
        (kycStatus) => evaluatePurchaseReadiness({ ...ready, kycStatus }).canPurchase,
      );

      expect(admitted).toEqual([KycStatus.VERIFIED]);
    });

    it("says what is wrong when the buyer has no record at all", () => {
      const result = evaluatePurchaseReadiness({
        ...ready,
        kycStatus: KycStatus.NOT_SUBMITTED,
      });

      expect(result.blockedBy).toBe(PURCHASE_BLOCK.KYC_REQUIRED);
      expect(result.reason).toMatch(/identity verification/i);
    });

    it("admits everybody while the gate is off, which is where E4-S2 leaves it", () => {
      for (const kycStatus of Object.values(KycStatus)) {
        expect(
          evaluatePurchaseReadiness({ ...ready, kycStatus, kycEnforced: false }).canPurchase,
        ).toBe(true);
      }
    });
  });

  describe("the feature flag", () => {
    it("withholds the step entirely, whatever else is true", () => {
      // Checked before everything, so a dark flag cannot be talked past by a transaction that is
      // otherwise perfectly ready.
      const result = evaluatePurchaseReadiness({ ...ready, featureEnabled: false });

      expect(result.blockedBy).toBe(PURCHASE_BLOCK.FEATURE_OFF);
      expect(result.reason).not.toMatch(/due diligence|identity/i);
    });

    it("never says why beyond not yet, on any status", () => {
      for (const status of ALL_STATUSES) {
        const result = evaluatePurchaseReadiness({ ...ready, status, featureEnabled: false });
        expect(result.blockedBy).toBe(PURCHASE_BLOCK.FEATURE_OFF);
      }
    });
  });

  describe("a blocked answer always carries a reason", () => {
    it("never refuses a buyer without telling them why", () => {
      const facts: PurchaseFacts[] = [];
      for (const status of ALL_STATUSES) {
        for (const verdict of [null, ...Object.values(DD_VERDICT)]) {
          for (const kycStatus of Object.values(KycStatus)) {
            for (const kycEnforced of [true, false]) {
              facts.push({ ...ready, status, verdict, kycStatus, kycEnforced });
            }
          }
        }
      }

      for (const fact of facts) {
        const result = evaluatePurchaseReadiness(fact);
        if (result.canPurchase) {
          expect(result.blockedBy).toBeNull();
          expect(result.reason).toBeNull();
        } else {
          expect(result.blockedBy).not.toBeNull();
          expect(result.reason?.length ?? 0).toBeGreaterThan(20);
        }
      }
      // The sweep has to be worth running: both outcomes have to occur in it.
      expect(facts.filter((f) => evaluatePurchaseReadiness(f).canPurchase).length).toBeGreaterThan(
        0,
      );
    });
  });
});

describe("purchaseFactsFrom", () => {
  const flags = { featureEnabled: true, kycEnforced: true };

  it("reads the verdict and the KYC status off a loaded row", () => {
    const facts = purchaseFactsFrom(
      {
        status: TransactionStatus.DD_COMPLETE,
        dueDiligenceOrder: { verdict: DD_VERDICT.PROCEED },
        buyer: { kycRecord: { status: KycStatus.VERIFIED } },
      },
      flags,
    );

    expect(facts).toEqual({
      status: TransactionStatus.DD_COMPLETE,
      verdict: DD_VERDICT.PROCEED,
      kycStatus: KycStatus.VERIFIED,
      featureEnabled: true,
      kycEnforced: true,
    });
  });

  it("treats no KYC record and a record never submitted as the same thing", () => {
    const missing = purchaseFactsFrom(
      { status: TransactionStatus.DD_COMPLETE, buyer: { kycRecord: null } },
      flags,
    );
    const noBuyer = purchaseFactsFrom({ status: TransactionStatus.DD_COMPLETE }, flags);

    expect(missing.kycStatus).toBe(KycStatus.NOT_SUBMITTED);
    expect(noBuyer.kycStatus).toBe(KycStatus.NOT_SUBMITTED);
  });

  it("reads no case and an unsigned case as no verdict", () => {
    expect(purchaseFactsFrom({ status: TransactionStatus.DD_COMPLETE }, flags).verdict).toBeNull();
    expect(
      purchaseFactsFrom(
        { status: TransactionStatus.DD_COMPLETE, dueDiligenceOrder: { verdict: null } },
        flags,
      ).verdict,
    ).toBeNull();
  });
});

describe("purchaseFlagsFrom", () => {
  it("reads the two keys the step depends on, and reads each of them once", () => {
    const seen: string[] = [];
    const flags = purchaseFlagsFrom({
      isEnabled: (key) => {
        seen.push(key);
        return key === PURCHASE_FLAG_KEYS.feature;
      },
    });

    expect(seen).toEqual([PURCHASE_FLAG_KEYS.feature, PURCHASE_FLAG_KEYS.kyc]);
    expect(flags).toEqual({ featureEnabled: true, kycEnforced: false });
  });

  it("does not cross the two flags over", () => {
    // Cheap to write and expensive to get wrong: crossed the other way, an operator arming KYC
    // would switch the purchase step on for everybody.
    const flags = purchaseFlagsFrom({ isEnabled: (key) => key === PURCHASE_FLAG_KEYS.kyc });

    expect(flags).toEqual({ featureEnabled: false, kycEnforced: true });
  });
});
