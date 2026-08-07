import {
  ALLOWED_HEADERS,
  EXPOSED_HEADERS,
  assertCorsConfigured,
  buildCorsOptions,
  isOriginAllowed,
  parseAllowedOrigins,
  readCorsEnvironment,
  type CorsEnvironment,
} from "./cors-config";

const PROD_ORIGIN = "https://safebuyrealties-app.vercel.app";
const TEAM_SLUG = "goodness-ifejesu-olajides-projects";

function env(overrides: Partial<CorsEnvironment> = {}): CorsEnvironment {
  return {
    frontendUrl: `http://localhost:8080,${PROD_ORIGIN}`,
    vercelTeamSlug: TEAM_SLUG,
    nodeEnv: "production",
    vercelEnv: "production",
    ...overrides,
  };
}

describe("parseAllowedOrigins", () => {
  it("splits on commas, trims, and drops empty entries", () => {
    expect(parseAllowedOrigins(` http://localhost:8080 , ,${PROD_ORIGIN},`)).toEqual([
      "http://localhost:8080",
      PROD_ORIGIN,
    ]);
  });

  it("returns an empty list when unset", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
  });

  it("drops entries that are not parseable absolute URLs", () => {
    expect(parseAllowedOrigins("not-a-url,https://ok.example.com")).toEqual([
      "https://ok.example.com",
    ]);
  });
});

describe("isOriginAllowed", () => {
  it("allows an origin on the FRONTEND_URL list", () => {
    expect(isOriginAllowed(PROD_ORIGIN, env())).toBe(true);
  });

  it("rejects an origin that is not on the list", () => {
    expect(isOriginAllowed("https://attacker.example.com", env())).toBe(false);
  });

  // Was "allows a Vercel preview matching the documented project pattern". The project prefix is
  // squattable (E5-S2a), so production no longer accepts it; outside production it still holds.
  it("allows a Vercel preview matching the project pattern outside production", () => {
    const dev = env({ nodeEnv: "development", vercelEnv: "preview" });
    expect(isOriginAllowed("https://safebuyrealties-app-git-fix-abc.vercel.app", dev)).toBe(true);
  });

  it("allows a Vercel preview matching the team-slug pattern", () => {
    expect(isOriginAllowed(`https://sbr-frontend-${TEAM_SLUG}.vercel.app`, env())).toBe(true);
  });

  // E5-S2a. .vercel.app subdomains are first-come-first-served, so anyone can register a
  // project called safebuyrealties-evil and own safebuyrealties-evil.vercel.app. The team-slug
  // rule below is not squattable, because Vercel team slugs are owned.
  describe("squattable project-prefix hostnames", () => {
    const SQUATTED = "https://safebuyrealties-evil.vercel.app";

    it("rejects a squatted project-prefix host in production", () => {
      expect(isOriginAllowed(SQUATTED, env())).toBe(false);
    });

    it("rejects it in production even with VERCEL_TEAM_SLUG unset", () => {
      expect(isOriginAllowed(SQUATTED, env({ vercelTeamSlug: undefined }))).toBe(false);
    });

    it.each(["development", "test"])("still accepts it in %s", (nodeEnv) => {
      expect(isOriginAllowed(SQUATTED, env({ nodeEnv, vercelEnv: undefined }))).toBe(true);
    });

    it("accepts any project-prefix host in production once it carries the team slug", () => {
      expect(isOriginAllowed(`https://anything-${TEAM_SLUG}.vercel.app`, env())).toBe(true);
      expect(isOriginAllowed(`https://safebuyrealties-evil-${TEAM_SLUG}.vercel.app`, env())).toBe(
        true,
      );
    });
  });

  describe("production with no VERCEL_TEAM_SLUG", () => {
    const noSlug = () => env({ vercelTeamSlug: undefined });

    it("accepts the FRONTEND_URL entries", () => {
      expect(isOriginAllowed(PROD_ORIGIN, noSlug())).toBe(true);
    });

    it.each([
      "https://safebuyrealties-app-git-fix-abc.vercel.app",
      `https://sbr-frontend-${TEAM_SLUG}.vercel.app`,
      "https://safebuyrealties.vercel.app",
    ])("accepts no preview origin, including %s", (origin) => {
      expect(isOriginAllowed(origin, noSlug())).toBe(false);
    });

    it.each(["", "   "])("treats a blank slug the same as unset", (vercelTeamSlug) => {
      expect(
        isOriginAllowed(`https://sbr-frontend-${TEAM_SLUG}.vercel.app`, env({ vercelTeamSlug })),
      ).toBe(false);
    });
  });

  // The reason the preview check is structural rather than a substring test.
  it.each([
    "https://evil-safebuyrealties.vercel.app.attacker.com",
    "https://safebuyrealties.vercel.app.attacker.com",
    `https://sbr-${TEAM_SLUG}.vercel.app.attacker.com`,
    "https://safebuyrealties.evil.vercel.app",
    "https://notsafebuyrealties.vercel.app",
  ])("rejects the lookalike host %s", (origin) => {
    expect(isOriginAllowed(origin, env())).toBe(false);
  });

  it("rejects a preview pattern served over http", () => {
    expect(isOriginAllowed("http://safebuyrealties-app.vercel.app", env())).toBe(false);
  });

  it("allows a request with no Origin header, such as the Paystack webhook", () => {
    expect(isOriginAllowed(undefined, env())).toBe(true);
    expect(isOriginAllowed("", env())).toBe(true);
  });

  it("rejects a malformed Origin header", () => {
    expect(isOriginAllowed("://nonsense", env())).toBe(false);
  });

  describe("outside production", () => {
    it.each(["development", "test"])("allows localhost on any port in %s", (nodeEnv) => {
      const dev = env({ nodeEnv, vercelEnv: undefined, frontendUrl: undefined });
      expect(isOriginAllowed("http://localhost:5173", dev)).toBe(true);
      expect(isOriginAllowed("http://localhost:9999", dev)).toBe(true);
      expect(isOriginAllowed("http://127.0.0.1:8080", dev)).toBe(true);
    });

    it("still rejects a non-local origin that is not on the list", () => {
      const dev = env({ nodeEnv: "development", vercelEnv: undefined, frontendUrl: undefined });
      expect(isOriginAllowed("https://attacker.example.com", dev)).toBe(false);
    });
  });

  it("does not allow localhost in production", () => {
    expect(isOriginAllowed("http://localhost:5173", env())).toBe(false);
  });
});

describe("assertCorsConfigured", () => {
  let exitSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, "exit").mockImplementation(() => undefined as never);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("exits when FRONTEND_URL is unset in production", () => {
    assertCorsConfigured(env({ frontendUrl: undefined }));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy.mock.calls[0][0]).toContain("FRONTEND_URL");
  });

  it("exits when FRONTEND_URL holds only empty entries in production", () => {
    assertCorsConfigured(env({ frontendUrl: " , ," }));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when only VERCEL_ENV marks production", () => {
    assertCorsConfigured(env({ nodeEnv: "development", frontendUrl: "" }));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("starts in production when FRONTEND_URL is set", () => {
    assertCorsConfigured(env());
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("starts outside production without FRONTEND_URL", () => {
    assertCorsConfigured(env({ nodeEnv: "development", vercelEnv: undefined, frontendUrl: "" }));
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("buildCorsOptions", () => {
  function resolve(origin: string | undefined): boolean | undefined {
    const options = buildCorsOptions(env());
    const originFn = options.origin as (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void;
    let allowed: boolean | undefined;
    originFn(origin, (_err, allow) => {
      allowed = allow;
    });
    return allowed;
  }

  it("resolves an allowed origin to true and a rejected one to false", () => {
    expect(resolve(PROD_ORIGIN)).toBe(true);
    expect(resolve("https://attacker.example.com")).toBe(false);
  });

  it("rejects without raising an error, so the server does not answer 500", () => {
    const options = buildCorsOptions(env());
    const originFn = options.origin as (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void;
    const callback = jest.fn();
    originFn("https://attacker.example.com", callback);
    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it("sends explicit header lists rather than a wildcard", () => {
    const options = buildCorsOptions(env());
    expect(options.allowedHeaders).toEqual(ALLOWED_HEADERS);
    expect(options.exposedHeaders).toEqual(EXPOSED_HEADERS);
    expect(options.allowedHeaders).not.toBe("*");
    expect(options.exposedHeaders).not.toBe("*");
    expect(options.credentials).toBe(true);
  });
});

describe("readCorsEnvironment", () => {
  it("reads the documented variable names", () => {
    expect(
      readCorsEnvironment({
        FRONTEND_URL: PROD_ORIGIN,
        VERCEL_TEAM_SLUG: TEAM_SLUG,
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      frontendUrl: PROD_ORIGIN,
      vercelTeamSlug: TEAM_SLUG,
      nodeEnv: "production",
      vercelEnv: "production",
    });
  });
});
