import { describe, expect, it } from "vitest";
import {
  buildTimeFlags,
  envVarForFlag,
  isFeatureEnabled,
  parseFlagValue,
  resolveFeatureFlags,
} from "@/lib/feature-flags";

describe("envVarForFlag", () => {
  it("derives the name rather than looking it up, so the two halves cannot disagree", () => {
    expect(envVarForFlag("payouts")).toBe("VITE_FEATURE_PAYOUTS");
    expect(envVarForFlag("dd_case_lifecycle")).toBe("VITE_FEATURE_DD_CASE_LIFECYCLE");
  });
});

describe("parseFlagValue", () => {
  it.each(["true", "1", "yes", "on", "enabled", "ON", " True "])("reads %j as on", (raw) => {
    expect(parseFlagValue(raw)).toBe(true);
  });

  it.each(["false", "0", "no", "off", "disabled", "OFF", " False "])("reads %j as off", (raw) => {
    expect(parseFlagValue(raw)).toBe(false);
  });

  it.each([undefined, "", "   ", "maybe", "yep", "2"])(
    "treats %j as unset rather than as off",
    (raw) => {
      expect(parseFlagValue(raw)).toBeNull();
    },
  );
});

describe("buildTimeFlags", () => {
  it("picks up VITE_FEATURE_* and lowercases the key back", () => {
    expect(buildTimeFlags({ VITE_FEATURE_PAYOUTS: "on", VITE_FEATURE_KYC_GATE: "off" })).toEqual({
      payouts: true,
      kyc_gate: false,
    });
  });

  it("ignores every other variable, including ones that only look related", () => {
    expect(
      buildTimeFlags({
        VITE_API_BASE_URL: "https://example.test",
        FEATURE_PAYOUTS: "on",
        VITE_FEATURES: "on",
        NODE_ENV: "test",
      }),
    ).toEqual({});
  });

  it("drops a value it cannot read instead of guessing at it", () => {
    expect(buildTimeFlags({ VITE_FEATURE_PAYOUTS: "maybe" })).toEqual({});
  });
});

describe("resolveFeatureFlags", () => {
  const env = { VITE_FEATURE_PAYOUTS: "on", VITE_FEATURE_KYC_GATE: "on" };

  it("uses the build-time values before the server has answered", () => {
    expect(resolveFeatureFlags(undefined, env)).toEqual({ payouts: true, kyc_gate: true });
  });

  it("lets the server overrule the build, which is the point of the whole system", () => {
    expect(resolveFeatureFlags({ payouts: false }, env)).toEqual({
      payouts: false,
      kyc_gate: true,
    });
  });

  it("keeps a key the build never heard of", () => {
    expect(resolveFeatureFlags({ privacy_centre: true }, env)).toMatchObject({
      privacy_centre: true,
    });
  });

  it("returns an empty set when neither side has anything to say", () => {
    expect(resolveFeatureFlags(undefined, {})).toEqual({});
  });
});

describe("isFeatureEnabled", () => {
  it("reads a flag that is present", () => {
    expect(isFeatureEnabled({ payouts: true }, "payouts")).toBe(true);
    expect(isFeatureEnabled({ payouts: false }, "payouts")).toBe(false);
  });

  it("is off for a key nobody declared, and off before anything has loaded", () => {
    expect(isFeatureEnabled({ payouts: true }, "payuots")).toBe(false);
    expect(isFeatureEnabled(undefined, "payouts")).toBe(false);
  });
});
