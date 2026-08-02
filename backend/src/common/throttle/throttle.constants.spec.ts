import {
  DEFAULT_THROTTLE_POLICY,
  THROTTLE_DISABLED_ENV_VAR,
  THROTTLE_POLICIES,
  THROTTLE_POLICY_KEYS,
  envVarFor,
  isThrottleDisabled,
  parsePolicyValue,
  resolveAllPolicies,
  resolvePolicy,
} from "./throttle.constants";

describe("throttle policy registry", () => {
  it("gives every policy a limit, a window and a description someone can act on", () => {
    for (const key of THROTTLE_POLICY_KEYS) {
      const policy = THROTTLE_POLICIES[key];
      expect(policy.limit).toBeGreaterThan(0);
      expect(policy.windowSeconds).toBeGreaterThan(0);
      expect(policy.description.length).toBeGreaterThan(20);
    }
  });

  it("covers every endpoint E5-S1 criterion 1 names", () => {
    // Password reset is here before its routes are. E5-S3 builds them behind auth_recovery and the
    // only thing it then has to write is the decorator.
    expect(THROTTLE_POLICY_KEYS).toEqual(
      expect.arrayContaining([
        "global",
        "login",
        "register",
        "activate",
        "password_reset",
        "payment_initiate",
        "guest_checkout",
      ]),
    );
  });

  it("keeps the default wider than every endpoint policy it backs off to", () => {
    for (const key of THROTTLE_POLICY_KEYS) {
      if (key === DEFAULT_THROTTLE_POLICY || key === "webhook") continue;
      const perSecond = THROTTLE_POLICIES[key].limit / THROTTLE_POLICIES[key].windowSeconds;
      const globalPerSecond =
        THROTTLE_POLICIES.global.limit / THROTTLE_POLICIES.global.windowSeconds;
      expect(perSecond).toBeLessThan(globalPerSecond);
    }
  });

  it("gives the webhook policy its own ceiling, well above login (criterion 4)", () => {
    expect(THROTTLE_POLICIES.webhook.limit).toBeGreaterThan(THROTTLE_POLICIES.login.limit);
  });

  it("derives one environment variable per policy and never collides", () => {
    const vars = THROTTLE_POLICY_KEYS.map(envVarFor);
    expect(new Set(vars).size).toBe(vars.length);
    expect(envVarFor("login")).toBe("THROTTLE_LOGIN");
    expect(envVarFor("payment_initiate")).toBe("THROTTLE_PAYMENT_INITIATE");
  });
});

describe("parsePolicyValue", () => {
  it("reads limit and window out of one value", () => {
    expect(parsePolicyValue("25:120")).toEqual({ limit: 25, windowSeconds: 120 });
  });

  it("ignores surrounding space", () => {
    expect(parsePolicyValue("  25:120  ")).toEqual({ limit: 25, windowSeconds: 120 });
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["one number", "25"],
    ["three parts", "25:120:5"],
    ["words", "lots"],
    ["half a value", "25:"],
    ["fractional", "2.5:60"],
    ["negative window", "25:-60"],
    ["a limit of zero, which would refuse every request", "0:60"],
    ["a window of zero", "25:0"],
  ])("treats %s as unset rather than guessing", (_label, raw) => {
    expect(parsePolicyValue(raw)).toBeNull();
  });
});

describe("resolvePolicy", () => {
  it("falls back to the declared default with nothing set", () => {
    const policy = resolvePolicy("login", {});
    expect(policy).toMatchObject({
      key: "login",
      source: "default",
      envVar: "THROTTLE_LOGIN",
      limit: THROTTLE_POLICIES.login.limit,
      windowSeconds: THROTTLE_POLICIES.login.windowSeconds,
    });
    expect(policy.envValueIgnored).toBeUndefined();
  });

  it("takes the environment's value when it reads", () => {
    const policy = resolvePolicy("login", { THROTTLE_LOGIN: "3:30" });
    expect(policy).toMatchObject({ source: "env", limit: 3, windowSeconds: 30 });
  });

  it("reports the value it dropped, so nobody thinks a typo took effect", () => {
    const policy = resolvePolicy("login", { THROTTLE_LOGIN: "lots" });
    expect(policy.source).toBe("default");
    expect(policy.envValueIgnored).toBe("lots");
    expect(policy.limit).toBe(THROTTLE_POLICIES.login.limit);
  });

  it("keeps one policy's variable out of another's", () => {
    const policies = resolveAllPolicies({ THROTTLE_LOGIN: "3:30" });
    expect(policies.get("login")).toMatchObject({ limit: 3 });
    expect(policies.get("register")).toMatchObject({
      source: "default",
      limit: THROTTLE_POLICIES.register.limit,
    });
  });

  it("resolves every key, so the guard never meets a policy it does not hold", () => {
    expect(resolveAllPolicies({}).size).toBe(THROTTLE_POLICY_KEYS.length);
  });
});

describe("isThrottleDisabled", () => {
  it("is off unless it is deliberately turned on", () => {
    expect(isThrottleDisabled({})).toBe(false);
    expect(isThrottleDisabled({ [THROTTLE_DISABLED_ENV_VAR]: "" })).toBe(false);
    expect(isThrottleDisabled({ [THROTTLE_DISABLED_ENV_VAR]: "false" })).toBe(false);
    // Anything that is not a recognised truthy value leaves the limits up, which is the safe way
    // round for a switch whose only job is to remove a protection.
    expect(isThrottleDisabled({ [THROTTLE_DISABLED_ENV_VAR]: "maybe" })).toBe(false);
  });

  it("reads the same truthy spellings as the feature flag switches", () => {
    expect(isThrottleDisabled({ [THROTTLE_DISABLED_ENV_VAR]: "true" })).toBe(true);
    expect(isThrottleDisabled({ [THROTTLE_DISABLED_ENV_VAR]: "1" })).toBe(true);
    expect(isThrottleDisabled({ [THROTTLE_DISABLED_ENV_VAR]: "ON" })).toBe(true);
  });
});
