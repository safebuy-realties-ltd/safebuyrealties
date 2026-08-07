import {
  isDevelopmentOrTest,
  isProductionEnvironment,
  isTestEnvironment,
  resolveRuntimeEnvironment,
  warnIfRuntimeEnvironmentUndeclared,
} from "./runtime-environment";

function warn(env: NodeJS.ProcessEnv) {
  const warnings: string[] = [];
  warnIfRuntimeEnvironmentUndeclared({
    env,
    logger: { warn: (msg: string) => warnings.push(msg) },
  });
  return warnings;
}

describe("resolveRuntimeEnvironment — what each signal says", () => {
  it("reads APP_ENV", () => {
    expect(resolveRuntimeEnvironment({ APP_ENV: "development" })).toBe("development");
    expect(resolveRuntimeEnvironment({ APP_ENV: "staging" })).toBe("staging");
    expect(resolveRuntimeEnvironment({ APP_ENV: "production" })).toBe("production");
  });

  it("reads NODE_ENV when APP_ENV is unset", () => {
    expect(resolveRuntimeEnvironment({ NODE_ENV: "development" })).toBe("development");
    expect(resolveRuntimeEnvironment({ NODE_ENV: "test" })).toBe("test");
    expect(resolveRuntimeEnvironment({ NODE_ENV: "production" })).toBe("production");
  });

  it("maps a Vercel preview to staging rather than to development", () => {
    expect(resolveRuntimeEnvironment({ VERCEL_ENV: "preview" })).toBe("staging");
    expect(resolveRuntimeEnvironment({ VERCEL_ENV: "production" })).toBe("production");
  });

  it("accepts the short spellings and ignores case and surrounding space", () => {
    expect(resolveRuntimeEnvironment({ APP_ENV: "  PROD " })).toBe("production");
    expect(resolveRuntimeEnvironment({ APP_ENV: "Dev" })).toBe("development");
  });

  it("treats whitespace as unset rather than as a value", () => {
    expect(resolveRuntimeEnvironment({ APP_ENV: "   ", NODE_ENV: "development" })).toBe(
      "development",
    );
  });
});

describe("resolveRuntimeEnvironment — the most hardened signal wins", () => {
  // The regression this module exists for. Every one of these resolved to development or was
  // treated as development before ADR-0006, on a host that was really serving production traffic.
  it("is production when nothing is declared at all", () => {
    expect(resolveRuntimeEnvironment({})).toBe("unknown");
    expect(isProductionEnvironment({})).toBe(true);
    expect(isDevelopmentOrTest({})).toBe(false);
  });

  it("is production when a value is set but not one we recognise", () => {
    expect(resolveRuntimeEnvironment({ APP_ENV: "prodction" })).toBe("unknown");
    expect(resolveRuntimeEnvironment({ NODE_ENV: "prd" })).toBe("unknown");
    expect(isProductionEnvironment({ NODE_ENV: "prd" })).toBe(true);
  });

  it("lets a lower signal be raised by a higher one, in either position", () => {
    expect(resolveRuntimeEnvironment({ NODE_ENV: "development", VERCEL_ENV: "production" })).toBe(
      "production",
    );
    expect(resolveRuntimeEnvironment({ APP_ENV: "development", NODE_ENV: "production" })).toBe(
      "production",
    );
    expect(resolveRuntimeEnvironment({ APP_ENV: "staging", VERCEL_ENV: "production" })).toBe(
      "production",
    );
  });

  it("never lets an explicit APP_ENV lower what another signal claims", () => {
    // Deliberate. Being wrong in this direction is what took the Secure flag off session cookies,
    // so APP_ENV is allowed to raise the environment and never to relax it.
    expect(isDevelopmentOrTest({ APP_ENV: "development", VERCEL_ENV: "production" })).toBe(false);
  });

  it("keeps a real Vercel preview production-like, as it was before", () => {
    // Vercel sets NODE_ENV=production on preview builds too, so this pair is what previews send.
    expect(resolveRuntimeEnvironment({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe(
      "production",
    );
  });

  it("breaks a tie towards the earlier signal, so the test runner stays the test runner", () => {
    expect(resolveRuntimeEnvironment({ NODE_ENV: "test" })).toBe("test");
    expect(resolveRuntimeEnvironment({ APP_ENV: "development", NODE_ENV: "test" })).toBe(
      "development",
    );
  });
});

describe("the predicates each guard is written against", () => {
  it("isDevelopmentOrTest is true only on a laptop or under the runner", () => {
    expect(isDevelopmentOrTest({ NODE_ENV: "development" })).toBe(true);
    expect(isDevelopmentOrTest({ NODE_ENV: "test" })).toBe(true);
    expect(isDevelopmentOrTest({ APP_ENV: "staging" })).toBe(false);
    expect(isDevelopmentOrTest({ APP_ENV: "production" })).toBe(false);
    expect(isDevelopmentOrTest({})).toBe(false);
  });

  it("isProductionEnvironment excludes staging but includes the undeclared case", () => {
    expect(isProductionEnvironment({ APP_ENV: "staging" })).toBe(false);
    expect(isProductionEnvironment({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionEnvironment({ APP_ENV: "production" })).toBe(true);
    expect(isProductionEnvironment({})).toBe(true);
  });

  it("isTestEnvironment separates test from development, which nothing else does", () => {
    expect(isTestEnvironment({ NODE_ENV: "test" })).toBe(true);
    expect(isTestEnvironment({ NODE_ENV: "development" })).toBe(false);
    expect(isTestEnvironment({})).toBe(false);
  });
});

describe("warnIfRuntimeEnvironmentUndeclared", () => {
  it("says nothing when the environment is declared", () => {
    expect(warn({ APP_ENV: "production" })).toEqual([]);
    expect(warn({ NODE_ENV: "development" })).toEqual([]);
    expect(warn({ VERCEL_ENV: "preview" })).toEqual([]);
  });

  it("warns when nothing is set, and says what it turned on", () => {
    const [message] = warn({});

    expect(message).toContain("treated as production");
    expect(message).toContain("None of APP_ENV, NODE_ENV or VERCEL_ENV is set.");
    expect(message).toContain("Secure cookies");
  });

  it("names only the value that was not recognised", () => {
    const [message] = warn({ APP_ENV: "prodction" });

    expect(message).toContain('APP_ENV="prodction" not recognised.');
    expect(message).not.toContain("NODE_ENV=");
  });

  it("never exits, because the undeclared case is the safe one", () => {
    const exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    warn({});
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});
