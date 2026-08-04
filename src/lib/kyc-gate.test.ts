import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  KYC_REQUIRED_CODE,
  KYC_SCREEN_PATH,
  isKycRequiredError,
  kycGateSearch,
} from "@/lib/kyc-gate";

/**
 * E4-S2 criterion 2, the browser's half.
 *
 * The server refuses a gated action with 403 and a code, and the only useful thing to do with that
 * refusal is put the buyer in front of the screen that fixes it and bring them back afterwards. Both
 * halves are easy to get wrong quietly: a code that drifts from the server's turns the refusal into
 * a generic red banner, and a return path taken on trust turns the KYC screen into an open redirect.
 */
describe("recognising the gate's refusal", () => {
  it("is the code the API refuses with, spelled the same way", () => {
    expect(KYC_REQUIRED_CODE).toBe("KYC_REQUIRED");
  });

  it("recognises the refusal the gate sends", () => {
    const refusal = new ApiError(
      "Your identity verification needs to be approved before you can execute a Power of Attorney.",
      "KYC_REQUIRED",
      { action: "POA_EXECUTION", kycStatus: "SUBMITTED" },
    );

    expect(isKycRequiredError(refusal)).toBe(true);
  });

  it("leaves every other refusal to the generic handler", () => {
    expect(isKycRequiredError(new ApiError("Not yours", "FORBIDDEN"))).toBe(false);
    expect(isKycRequiredError(new ApiError("API is down", "NETWORK_ERROR"))).toBe(false);
    expect(isKycRequiredError(new ApiError("Already executed", "CONFLICT"))).toBe(false);
  });

  it("reads the code rather than the message, so prose cannot trigger the gate", () => {
    expect(isKycRequiredError(new Error("KYC_REQUIRED"))).toBe(false);
  });

  it("survives whatever a rejected promise actually carries", () => {
    expect(isKycRequiredError(null)).toBe(false);
    expect(isKycRequiredError(undefined)).toBe(false);
    expect(isKycRequiredError("KYC_REQUIRED")).toBe(false);
    expect(isKycRequiredError({})).toBe(false);
  });

  /**
   * Several component tests replace `@/lib/api` with a stub whose `ApiError` is a different class
   * object, and `instanceof` is false across that boundary however right the error is. The field is
   * the contract the server sends; the class is only how this bundle happens to carry it.
   */
  it("matches on the field, so a stubbed ApiError still counts", () => {
    expect(isKycRequiredError({ code: KYC_REQUIRED_CODE })).toBe(true);
  });
});

describe("the return path", () => {
  it("points at the screen that fixes it", () => {
    expect(KYC_SCREEN_PATH).toBe("/dashboard/buyer/kyc");
  });

  it("carries an internal path back", () => {
    expect(kycGateSearch("/purchase/listing-1")).toEqual({ redirect: "/purchase/listing-1" });
  });

  it("carries a path with a query string back whole", () => {
    expect(kycGateSearch("/dashboard/buyer/transactions?mock=1")).toEqual({
      redirect: "/dashboard/buyer/transactions?mock=1",
    });
  });

  it("carries nothing when the caller has nowhere to send them back to", () => {
    expect(kycGateSearch(undefined)).toEqual({ redirect: undefined });
    expect(kycGateSearch("")).toEqual({ redirect: undefined });
  });

  it.each([
    ["an absolute URL", "https://evil.test/collect"],
    ["a protocol-relative URL", "//evil.test/collect"],
    ["a bare host", "evil.test"],
    ["a script URL", "javascript:alert(1)"],
  ])("drops %s rather than handing it to the router", (_label, hostile) => {
    expect(kycGateSearch(hostile)).toEqual({ redirect: undefined });
  });
});
