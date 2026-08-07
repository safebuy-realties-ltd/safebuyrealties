import {
  arePaymentsLive,
  assertPaymentsConfigured,
  hasPaymentSecretKey,
  isForceMockHonoured,
  isMockReference,
  MOCK_REFERENCE_PREFIX,
} from "./payments-guard";

const LIVE_KEY = "sk_live_deadbeefdeadbeefdeadbeef";

function guard(env: NodeJS.ProcessEnv) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const exits: number[] = [];
  assertPaymentsConfigured({
    env,
    logger: {
      error: (msg: string) => errors.push(msg),
      warn: (msg: string) => warnings.push(msg),
    },
    exit: ((code: number) => {
      exits.push(code);
    }) as (code: number) => never,
  });
  return { errors, warnings, exits };
}

// isProductionEnvironment moved to ./runtime-environment.ts, and its tests with it.

describe("assertPaymentsConfigured — startup fails in production without a key", () => {
  it("exits when NODE_ENV=production and no Paystack secret key is set", () => {
    const { errors, exits } = guard({ NODE_ENV: "production" });

    expect(exits).toEqual([1]);
    expect(errors.join("\n")).toContain("Refusing to start");
  });

  it("exits when VERCEL_ENV=production and no Paystack secret key is set", () => {
    const { exits } = guard({ VERCEL_ENV: "production" });

    expect(exits).toEqual([1]);
  });

  it("starts in production when PAYSTACK_SECRET_KEY is set", () => {
    const { errors, exits } = guard({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: LIVE_KEY });

    expect(exits).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("accepts the test key variable as a credential", () => {
    const { exits } = guard({ NODE_ENV: "production", PAYSTACK_TEST_SECRET_KEY: "sk_test_x" });

    expect(exits).toEqual([]);
  });

  it("treats a blank key as no key", () => {
    const { exits } = guard({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: "   " });

    expect(exits).toEqual([1]);
  });

  it("never exits outside production, even with no key at all", () => {
    // `{}` used to be in this list, on the reading that an unset NODE_ENV meant a laptop. Since
    // ADR-0006 an undeclared environment is production, and the case below covers it.
    for (const env of [
      { NODE_ENV: "development" },
      { NODE_ENV: "test" },
      { APP_ENV: "staging" },
      { VERCEL_ENV: "preview" },
    ]) {
      expect(guard(env).exits).toEqual([]);
    }
  });

  it("exits when no key is set and nothing declares the environment", () => {
    const { errors, exits } = guard({});

    expect(exits).toEqual([1]);
    expect(errors.join("\n")).toContain("Refusing to start");
  });

  it("starts when a key is set and nothing declares the environment", () => {
    expect(guard({ PAYSTACK_SECRET_KEY: LIVE_KEY }).exits).toEqual([]);
  });

  it("does not put the key, or any part of it, in the failure message", () => {
    const { errors } = guard({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: "" });

    expect(errors.join("\n")).not.toContain(LIVE_KEY);
  });
});

describe("PAYSTACK_FORCE_MOCK is honoured in development and test only", () => {
  it("is honoured in development", () => {
    expect(isForceMockHonoured({ NODE_ENV: "development", PAYSTACK_FORCE_MOCK: "true" })).toBe(
      true,
    );
  });

  it("is honoured in test", () => {
    expect(isForceMockHonoured({ NODE_ENV: "test", PAYSTACK_FORCE_MOCK: "1" })).toBe(true);
  });

  it("is refused when nothing declares the environment", () => {
    // This assertion used to read the other way, on the reading that an unset NODE_ENV meant local
    // development. It is the path by which mock payments could have reached a real deployment: a
    // host that never set NODE_ENV would have honoured PAYSTACK_FORCE_MOCK and written payouts as
    // COMPLETED without moving money. See ADR-0003 and ADR-0006.
    expect(isForceMockHonoured({ PAYSTACK_FORCE_MOCK: "yes" })).toBe(false);
  });

  it("is refused in staging", () => {
    expect(isForceMockHonoured({ APP_ENV: "staging", PAYSTACK_FORCE_MOCK: "true" })).toBe(false);
  });

  it("is ignored in production", () => {
    expect(
      isForceMockHonoured({
        NODE_ENV: "production",
        PAYSTACK_FORCE_MOCK: "true",
        PAYSTACK_SECRET_KEY: LIVE_KEY,
      }),
    ).toBe(false);
  });

  it("is ignored on a Vercel production deployment", () => {
    expect(isForceMockHonoured({ VERCEL_ENV: "production", PAYSTACK_FORCE_MOCK: "true" })).toBe(
      false,
    );
  });

  it("is ignored in any other environment, such as staging", () => {
    expect(isForceMockHonoured({ NODE_ENV: "staging", PAYSTACK_FORCE_MOCK: "true" })).toBe(false);
  });

  it("warns at startup when it is set somewhere it will be ignored", () => {
    const { warnings, exits } = guard({
      NODE_ENV: "production",
      PAYSTACK_FORCE_MOCK: "true",
      PAYSTACK_SECRET_KEY: LIVE_KEY,
    });

    expect(exits).toEqual([]);
    expect(warnings.join("\n")).toContain("PAYSTACK_FORCE_MOCK is set but will be ignored");
  });

  it("does not warn where it is honoured", () => {
    expect(guard({ NODE_ENV: "development", PAYSTACK_FORCE_MOCK: "true" }).warnings).toEqual([]);
  });

  it("does not warn when it is not set", () => {
    expect(guard({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: LIVE_KEY }).warnings).toEqual([]);
  });

  it("still refuses to start in production when force-mock is set and no key exists", () => {
    // The override must not be a back door around the production guard.
    const { exits } = guard({ NODE_ENV: "production", PAYSTACK_FORCE_MOCK: "true" });

    expect(exits).toEqual([1]);
  });
});

describe("arePaymentsLive", () => {
  it("is true with a key and no honoured override", () => {
    expect(arePaymentsLive({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: LIVE_KEY })).toBe(true);
  });

  it("is false when development forces mock despite a key", () => {
    expect(
      arePaymentsLive({
        NODE_ENV: "development",
        PAYSTACK_FORCE_MOCK: "true",
        PAYSTACK_SECRET_KEY: LIVE_KEY,
      }),
    ).toBe(false);
  });

  it("is false with no key", () => {
    expect(arePaymentsLive({ NODE_ENV: "development" })).toBe(false);
  });

  it("reports only a boolean, never the key", () => {
    expect(typeof hasPaymentSecretKey({ PAYSTACK_SECRET_KEY: LIVE_KEY })).toBe("boolean");
  });
});

describe("isMockReference", () => {
  it("recognises a mock payment reference", () => {
    expect(isMockReference(`${MOCK_REFERENCE_PREFIX}abc-123`)).toBe(true);
  });

  it("recognises a mock payout reference", () => {
    expect(isMockReference(`${MOCK_REFERENCE_PREFIX}transfer_abc12345`)).toBe(true);
  });

  it("does not flag a live Paystack reference", () => {
    expect(isMockReference("sbr_payout_abc123456789")).toBe(false);
    expect(isMockReference("T123456789")).toBe(false);
  });

  it("does not flag a failed live transfer", () => {
    expect(isMockReference("transfer_failed_abc12345")).toBe(false);
  });

  it("treats an absent reference as not mock", () => {
    expect(isMockReference(null)).toBe(false);
    expect(isMockReference(undefined)).toBe(false);
  });
});
