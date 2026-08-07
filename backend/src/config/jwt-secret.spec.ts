import {
  assertJwtSecret,
  DEVELOPMENT_JWT_SECRET,
  inspectJwtSecret,
  MIN_JWT_SECRET_LENGTH,
  resolveJwtSecret,
} from "./jwt-secret";

/** A plausible operator-chosen secret: long enough, and not ours. */
const GOOD_SECRET = "Zb7yQpK3vR8sT1wX5nD2gH6jL9mC4fA0eU";

/** The literal this story deleted from auth.module.ts and jwt.strategy.ts. */
const OLD_FALLBACK = "dev-secret-change-me";

/**
 * `{}` is deliberately absent. An undeclared environment used to sit here, because the old
 * production check defaulted it to development; since ADR-0006 it resolves to production and is
 * covered by the undeclared-environment test below instead.
 */
const OUTSIDE_PRODUCTION: NodeJS.ProcessEnv[] = [
  { NODE_ENV: "development" },
  { NODE_ENV: "test" },
  { APP_ENV: "staging" },
  { VERCEL_ENV: "preview" },
];

function guard(env: NodeJS.ProcessEnv) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const exits: number[] = [];
  assertJwtSecret({
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

describe("inspectJwtSecret", () => {
  it("rejects an unset secret", () => {
    expect(inspectJwtSecret(undefined)).toBe("missing");
  });

  it("rejects an empty or whitespace-only secret", () => {
    expect(inspectJwtSecret("")).toBe("missing");
    expect(inspectJwtSecret("   ")).toBe("missing");
  });

  it("rejects the development default, which is long enough to pass the length rule", () => {
    expect(DEVELOPMENT_JWT_SECRET.length).toBeGreaterThanOrEqual(MIN_JWT_SECRET_LENGTH);
    expect(inspectJwtSecret(DEVELOPMENT_JWT_SECRET)).toBe("development-fallback");
  });

  it("rejects a secret shorter than the minimum", () => {
    expect(inspectJwtSecret("a".repeat(MIN_JWT_SECRET_LENGTH - 1))).toBe("too-short");
  });

  it("rejects the literal this story deleted from the auth module", () => {
    expect(inspectJwtSecret(OLD_FALLBACK)).toBe("too-short");
  });

  it("accepts a secret of exactly the minimum length", () => {
    expect(inspectJwtSecret("a".repeat(MIN_JWT_SECRET_LENGTH))).toBeNull();
  });

  it("accepts an operator-chosen secret", () => {
    expect(inspectJwtSecret(GOOD_SECRET)).toBeNull();
  });

  it("measures length after trimming, so padding cannot buy a short secret its way in", () => {
    expect(inspectJwtSecret(`   ${OLD_FALLBACK}   `)).toBe("too-short");
  });
});

describe("resolveJwtSecret", () => {
  it("falls back to the one named development default when unset", () => {
    expect(resolveJwtSecret(undefined)).toBe(DEVELOPMENT_JWT_SECRET);
  });

  it("falls back when the value is empty or whitespace", () => {
    expect(resolveJwtSecret("")).toBe(DEVELOPMENT_JWT_SECRET);
    expect(resolveJwtSecret("   ")).toBe(DEVELOPMENT_JWT_SECRET);
  });

  it("returns a configured value verbatim, never trimmed", () => {
    // Trimming here would change the signing key and invalidate every issued token.
    expect(resolveJwtSecret(` ${GOOD_SECRET} `)).toBe(` ${GOOD_SECRET} `);
  });

  it("returns a short configured value unchanged, because the guard already ran", () => {
    expect(resolveJwtSecret(OLD_FALLBACK)).toBe(OLD_FALLBACK);
  });

  it("never returns the literal this story deleted", () => {
    expect(resolveJwtSecret(undefined)).not.toBe(OLD_FALLBACK);
  });
});

describe("assertJwtSecret — production refuses to start on an unusable secret", () => {
  it("exits when JWT_SECRET is unset", () => {
    const { errors, exits } = guard({ NODE_ENV: "production" });

    expect(exits).toEqual([1]);
    expect(errors.join("\n")).toContain("Refusing to start");
  });

  it("exits when JWT_SECRET is empty", () => {
    expect(guard({ NODE_ENV: "production", JWT_SECRET: "" }).exits).toEqual([1]);
  });

  it("exits when JWT_SECRET is whitespace only", () => {
    expect(guard({ NODE_ENV: "production", JWT_SECRET: "   " }).exits).toEqual([1]);
  });

  it("exits when JWT_SECRET is too short", () => {
    const { errors, exits } = guard({ NODE_ENV: "production", JWT_SECRET: OLD_FALLBACK });

    expect(exits).toEqual([1]);
    expect(errors.join("\n")).toContain(`shorter than ${MIN_JWT_SECRET_LENGTH} characters`);
  });

  it("exits when the example file was copied into production unedited", () => {
    const { errors, exits } = guard({
      NODE_ENV: "production",
      JWT_SECRET: DEVELOPMENT_JWT_SECRET,
    });

    expect(exits).toEqual([1]);
    expect(errors.join("\n")).toContain("development default");
  });

  it("exits on a Vercel production deployment even without NODE_ENV", () => {
    expect(guard({ VERCEL_ENV: "production" }).exits).toEqual([1]);
  });

  it("starts in production with a good secret", () => {
    const { errors, exits, warnings } = guard({ NODE_ENV: "production", JWT_SECRET: GOOD_SECRET });

    expect(exits).toEqual([]);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("names the variable and the fix", () => {
    const message = guard({ NODE_ENV: "production" }).errors.join("\n");

    expect(message).toContain("JWT_SECRET");
    expect(message).toContain("openssl rand");
    expect(message).toContain("docs/RUNBOOK.md §7.2");
  });

  it("never prints any part of the configured value", () => {
    const secret = "correct-horse-battery-staple-not-long-enough-oh-wait-it-is";
    const message = guard({ NODE_ENV: "production", JWT_SECRET: DEVELOPMENT_JWT_SECRET })
      .errors.concat(guard({ NODE_ENV: "production", JWT_SECRET: secret.slice(0, 10) }).errors)
      .join("\n");

    expect(message).not.toContain(DEVELOPMENT_JWT_SECRET);
    expect(message).not.toContain(secret.slice(0, 10));
    // Not even a prefix long enough to be worth guessing from.
    expect(message).not.toContain(secret.slice(0, 6));
  });
});

describe("assertJwtSecret — an undeclared environment is treated as production", () => {
  it("refuses to start with no secret and nothing declaring the environment", () => {
    const { errors, exits } = guard({});

    expect(exits).toEqual([1]);
    expect(errors.join("\n")).toContain("Refusing to start");
  });

  it("refuses to start on the development default when nothing declares the environment", () => {
    expect(guard({ JWT_SECRET: DEVELOPMENT_JWT_SECRET }).exits).toEqual([1]);
    expect(guard({ JWT_SECRET: OLD_FALLBACK }).exits).toEqual([1]);
  });

  it("refuses to start when the declared environment is not one we recognise", () => {
    expect(guard({ APP_ENV: "prodction" }).exits).toEqual([1]);
  });

  it("starts on a usable secret, so declaring nothing is safe rather than merely broken", () => {
    expect(guard({ JWT_SECRET: GOOD_SECRET }).exits).toEqual([]);
  });
});

describe("assertJwtSecret — outside production it never blocks the boot", () => {
  it("does not exit for any unusable value in any non-production environment", () => {
    for (const base of OUTSIDE_PRODUCTION) {
      for (const JWT_SECRET of [undefined, "", "   ", OLD_FALLBACK, DEVELOPMENT_JWT_SECRET]) {
        expect(guard({ ...base, JWT_SECRET }).exits).toEqual([]);
      }
    }
  });

  it("stays silent when the secret is missing, which is the normal local state", () => {
    const { errors, warnings } = guard({ NODE_ENV: "development" });

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("stays silent on the development default, which is what the example file ships", () => {
    const { warnings } = guard({ NODE_ENV: "development", JWT_SECRET: DEVELOPMENT_JWT_SECRET });

    expect(warnings).toEqual([]);
  });

  it("warns about a short secret, because that is the value about to be promoted", () => {
    const { warnings, exits } = guard({ NODE_ENV: "development", JWT_SECRET: OLD_FALLBACK });

    expect(exits).toEqual([]);
    expect(warnings.join("\n")).toContain(`${OLD_FALLBACK.length} characters`);
    expect(warnings.join("\n")).toContain("stop the API from starting when it is deployed");
  });

  it("does not put the short secret in the warning either", () => {
    const { warnings } = guard({ NODE_ENV: "development", JWT_SECRET: OLD_FALLBACK });

    expect(warnings.join("\n")).not.toContain(OLD_FALLBACK);
  });

  it("stays silent on a good secret", () => {
    const { errors, warnings } = guard({ NODE_ENV: "development", JWT_SECRET: GOOD_SECRET });

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
