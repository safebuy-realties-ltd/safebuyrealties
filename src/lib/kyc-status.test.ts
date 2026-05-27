import { describe, expect, it } from "vitest";
import { kycCanSubmit, kycStatusMessage } from "./kyc-status";

describe("kyc-status", () => {
  it("returns buyer-facing copy for each status", () => {
    expect(kycStatusMessage("NOT_SUBMITTED")).toContain("verify your identity");
    expect(kycStatusMessage("SUBMITTED")).toContain("under review");
    expect(kycStatusMessage("VERIFIED")).toContain("Identity Verified");
    expect(kycStatusMessage("REJECTED", "Blurry photo")).toContain("Blurry photo");
  });

  it("allows submit only for NOT_SUBMITTED and REJECTED", () => {
    expect(kycCanSubmit("NOT_SUBMITTED")).toBe(true);
    expect(kycCanSubmit("REJECTED")).toBe(true);
    expect(kycCanSubmit("SUBMITTED")).toBe(false);
    expect(kycCanSubmit("VERIFIED")).toBe(false);
  });
});
