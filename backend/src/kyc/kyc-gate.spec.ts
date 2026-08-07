import { HttpStatus, type ArgumentsHost } from "@nestjs/common";
import type { Response } from "express";
import { HttpExceptionFilter } from "../common/filters/http-exception.filter";
import type { FeatureFlagKey } from "../feature-flags/feature-flags.constants";
import { PURCHASE_BLOCK } from "../transactions/purchase-readiness";
import { KycStatus } from "./kyc.constants";
import {
  KYC_ACTIONS,
  KYC_BLOCK_CODE,
  KYC_GATED_ACTIONS,
  KYC_GATE_FLAG,
  KycRequiredException,
  assertKycGate,
  describeKycAction,
  evaluateKycGate,
  kycRequiredFor,
} from "./kyc-gate";

/** The gate armed: the one flag it reads is on. */
const armed = { isEnabled: (key: FeatureFlagKey) => key === KYC_GATE_FLAG };
/** The gate disarmed, which is the MVP default and the demo setting. */
const disarmed = { isEnabled: () => false };

const UNVERIFIED = [KycStatus.NOT_SUBMITTED, KycStatus.SUBMITTED, KycStatus.REJECTED];

describe("the KYC policy registry (E4-S2 criterion 1)", () => {
  it("requires verified identity to pay for a property", () => {
    expect(KYC_GATED_ACTIONS.PROPERTY_PURCHASE.requiresVerified).toBe(true);
  });

  it("requires verified identity to execute a Power of Attorney", () => {
    expect(KYC_GATED_ACTIONS.POA_EXECUTION.requiresVerified).toBe(true);
  });

  it("does not require it to buy due diligence, which is the step that earns the trust", () => {
    expect(KYC_GATED_ACTIONS.DUE_DILIGENCE_PURCHASE.requiresVerified).toBe(false);
  });

  it("declares the seller payout destination, which E2-S1 has still to wire up", () => {
    expect(KYC_GATED_ACTIONS.SELLER_PAYOUT_ACCOUNT.requiresVerified).toBe(true);
    expect(KYC_GATED_ACTIONS.SELLER_PAYOUT_ACCOUNT.story).toBe("E2-S1");
  });

  it("gives every action a refusal a buyer can act on and a story that owns it", () => {
    for (const action of KYC_ACTIONS) {
      const definition = KYC_GATED_ACTIONS[action];
      expect(definition.blockedReason.length).toBeGreaterThan(20);
      expect(definition.description.length).toBeGreaterThan(10);
      expect(definition.story).toMatch(/^E\d-S\d$/);
    }
  });
});

describe("arming the gate (E4-S2 criterion 6)", () => {
  it("requires nothing of anybody while kyc_gate is off, whatever the registry says", () => {
    for (const action of KYC_ACTIONS) {
      expect(kycRequiredFor(action, disarmed)).toBe(false);
    }
  });

  it("falls back to the registry once kyc_gate is on", () => {
    for (const action of KYC_ACTIONS) {
      expect(kycRequiredFor(action, armed)).toBe(KYC_GATED_ACTIONS[action].requiresVerified);
    }
  });

  it("says which of the two answered, so off is never mistaken for not gated", () => {
    expect(describeKycAction("PROPERTY_PURCHASE", disarmed)).toMatchObject({
      requiresVerified: false,
      source: "flag-off",
    });
    expect(describeKycAction("PROPERTY_PURCHASE", armed)).toMatchObject({
      requiresVerified: true,
      source: "registry",
    });
  });

  it("reports the flag it depends on, so a reader does not have to derive it", () => {
    expect(describeKycAction("POA_EXECUTION", armed).flag).toBe(KYC_GATE_FLAG);
  });

  it("reads one flag, reads it once, and reads the right one", () => {
    const seen: string[] = [];
    kycRequiredFor("PROPERTY_PURCHASE", {
      isEnabled: (key) => {
        seen.push(key);
        return true;
      },
    });

    expect(seen).toEqual([KYC_GATE_FLAG]);
  });
});

describe("the decision", () => {
  it("lets a verified buyer through a gated action", () => {
    const decision = evaluateKycGate("PROPERTY_PURCHASE", KycStatus.VERIFIED, armed);

    expect(decision).toMatchObject({ allowed: true, requiresVerified: true, reason: null });
  });

  it.each(UNVERIFIED)("blocks a %s buyer on a gated action", (status) => {
    const decision = evaluateKycGate("PROPERTY_PURCHASE", status, armed);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(KYC_GATED_ACTIONS.PROPERTY_PURCHASE.blockedReason);
    expect(decision.kycStatus).toBe(status);
  });

  it("waiting on a review is still not verified, because the gate is not a queue position", () => {
    expect(evaluateKycGate("POA_EXECUTION", KycStatus.SUBMITTED, armed).allowed).toBe(false);
  });

  it.each(UNVERIFIED)("lets a %s buyer buy due diligence even with the gate armed", (status) => {
    const decision = evaluateKycGate("DUE_DILIGENCE_PURCHASE", status, armed);

    expect(decision).toMatchObject({ allowed: true, requiresVerified: false, reason: null });
  });

  it.each(UNVERIFIED)("lets a %s buyer through everything with the gate off", (status) => {
    for (const action of KYC_ACTIONS) {
      expect(evaluateKycGate(action, status, disarmed).allowed).toBe(true);
    }
  });
});

describe("the refusal (E4-S2 criterion 2)", () => {
  it("throws nothing when the action is allowed", () => {
    expect(() => assertKycGate("PROPERTY_PURCHASE", KycStatus.VERIFIED, armed)).not.toThrow();
    expect(() => assertKycGate("PROPERTY_PURCHASE", KycStatus.REJECTED, disarmed)).not.toThrow();
  });

  it("throws 403 rather than 401, because the caller is known and simply not cleared", () => {
    expect(() => assertKycGate("POA_EXECUTION", KycStatus.SUBMITTED, armed)).toThrow(
      KycRequiredException,
    );

    try {
      assertKycGate("POA_EXECUTION", KycStatus.SUBMITTED, armed);
      fail("expected the gate to refuse");
    } catch (error) {
      expect((error as KycRequiredException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });

  describe("as the browser receives it", () => {
    let res: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };

    function host(): ArgumentsHost {
      const req = { method: "POST", originalUrl: "/api/v1/poa/execute", headers: {} };
      return {
        switchToHttp: () => ({
          getResponse: () => res as unknown as Response,
          getRequest: () => req,
        }),
      } as unknown as ArgumentsHost;
    }

    function refuse(): { code: string; message: string; details?: Record<string, unknown> } {
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      };
      new HttpExceptionFilter().catch(
        new KycRequiredException("POA_EXECUTION", KycStatus.REJECTED),
        host(),
      );
      return (res.json.mock.calls[0][0] as { error: ReturnType<typeof refuse> }).error;
    }

    it("carries a code the browser can branch on without reading prose", () => {
      expect(refuse().code).toBe(KYC_BLOCK_CODE);
    });

    it("uses the same code the purchase button already reports, so one predicate covers both", () => {
      expect(KYC_BLOCK_CODE).toBe(PURCHASE_BLOCK.KYC_REQUIRED);
    });

    it("names the action and the status, so the KYC screen knows what it is fixing", () => {
      expect(refuse().details).toEqual({
        action: "POA_EXECUTION",
        kycStatus: KycStatus.REJECTED,
      });
    });

    it("says why in the buyer's words rather than the policy's", () => {
      expect(refuse().message).toBe(KYC_GATED_ACTIONS.POA_EXECUTION.blockedReason);
    });
  });
});
