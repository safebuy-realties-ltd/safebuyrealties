import { describe, expect, it, beforeEach } from "vitest";
import {
  clearWizardState,
  defaultWizardState,
  loadWizardState,
  saveWizardState,
  stepIndex,
  stepProgressPercent,
  stepLabel,
  wizardStorageKey,
  isBuyerInfoComplete,
  isServiceSelectionValid,
} from "@/lib/purchase-wizard";

describe("purchase-wizard session storage", () => {
  const listingId = "listing-abc";

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("uses a listing-scoped storage key", () => {
    expect(wizardStorageKey(listingId)).toBe("purchase-wizard:listing-abc");
  });

  it("persists and restores wizard state", () => {
    const state = {
      ...defaultWizardState(),
      step: "BUYER_INFO" as const,
      buyerInfo: {
        legalName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+2348000000000",
        country: "Nigeria",
        state: "Lagos",
      },
    };
    saveWizardState(listingId, state);
    expect(loadWizardState(listingId)).toEqual(state);
  });

  it("persists PoA execution metadata in wizard state", () => {
    const state = {
      ...defaultWizardState(),
      step: "POA_EXECUTION" as const,
      transactionId: "tx-1",
      poaId: "poa-1",
      poaDocumentHash: "a".repeat(64),
    };
    saveWizardState(listingId, state);
    expect(loadWizardState(listingId)).toEqual(state);
  });

  it("returns null for invalid stored JSON", () => {
    sessionStorage.setItem(wizardStorageKey(listingId), "{not-json");
    expect(loadWizardState(listingId)).toBeNull();
  });
});

describe("purchase-wizard helpers", () => {
  it("maps step index and progress", () => {
    expect(stepIndex("PROPERTY_CONFIRMATION")).toBe(0);
    expect(stepIndex("SUCCESS")).toBe(6);
    expect(stepProgressPercent("PROPERTY_CONFIRMATION")).toBe(14);
    expect(stepProgressPercent("SUCCESS")).toBe(100);
  });

  it("provides human-readable step labels", () => {
    expect(stepLabel("SERVICE_SELECTION")).toBe("Services");
  });

  it("validates buyer info completeness", () => {
    expect(
      isBuyerInfoComplete({
        legalName: "Test Buyer",
        email: "buyer@example.com",
        phone: "0800",
        country: "Nigeria",
        state: "Abuja",
      }),
    ).toBe(true);
    expect(isBuyerInfoComplete({ legalName: "", email: "", phone: "", country: "", state: "" })).toBe(
      false,
    );
  });

  it("validates service selection", () => {
    expect(
      isServiceSelectionValid({
        bundleId: "bundle-1",
        itemIds: ["a"],
        subtotal: 100,
        vat: 7,
        total: 107,
      }),
    ).toBe(true);
    expect(isServiceSelectionValid(undefined)).toBe(false);
  });
});
