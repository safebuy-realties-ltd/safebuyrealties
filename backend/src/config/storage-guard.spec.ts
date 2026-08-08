import {
  assertStorageConfigured,
  hasEphemeralFilesystem,
  missingS3Settings,
  resolveStorageDriver,
} from "./storage-guard";

/**
 * The guard's contract is a refused boot, so every test here asserts on whether `exit` was called
 * and never on a thrown error. A guard that threw would be caught by whatever calls it and the
 * process would carry on, which is the failure this is written to prevent.
 */
function harness(env: NodeJS.ProcessEnv) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const exits: number[] = [];
  assertStorageConfigured({
    env,
    logger: {
      error: (line: string) => errors.push(line),
      warn: (line: string) => warnings.push(line),
    },
    // Real `exit` never returns, so the guard's own control flow assumes the process stops here.
    // This one does return, which means a test can also assert on what the guard would have done
    // next, and the `as never` is the price of that.
    exit: ((code: number) => {
      exits.push(code);
    }) as (code: number) => never,
  });
  return { errors, warnings, exits, refused: exits.includes(1) };
}

const S3_COMPLETE = {
  STORAGE_DRIVER: "s3",
  AWS_REGION: "af-south-1",
  AWS_S3_BUCKET: "sbr-documents",
  AWS_ACCESS_KEY_ID: "AKIA_EXAMPLE",
  AWS_SECRET_ACCESS_KEY: "secret-example",
};

describe("resolveStorageDriver", () => {
  it("treats an unset driver as local, which is the developer default", () => {
    expect(resolveStorageDriver({})).toEqual({ driver: "local" });
  });

  it.each([
    ["S3", "s3"],
    [" s3 ", "s3"],
    ["Local", "local"],
  ])("normalises %s to %s, as StorageService's constructor does", (raw, expected) => {
    expect(resolveStorageDriver({ STORAGE_DRIVER: raw })).toEqual({ driver: expected });
  });

  it("carries the raw value on an unrecognised driver, for the message only", () => {
    expect(resolveStorageDriver({ STORAGE_DRIVER: "gcs" })).toEqual({
      driver: "unrecognised",
      raw: "gcs",
    });
  });
});

describe("missingS3Settings", () => {
  it("is empty when everything required is present", () => {
    expect(missingS3Settings(S3_COMPLETE)).toEqual([]);
  });

  it("names region and bucket when neither is set", () => {
    expect(missingS3Settings({ STORAGE_DRIVER: "s3" })).toEqual(
      expect.arrayContaining(["AWS_REGION", "AWS_S3_BUCKET"]),
    );
  });

  it("treats whitespace as absent, because an empty quoted value in .env is a common mistake", () => {
    expect(missingS3Settings({ ...S3_COMPLETE, AWS_S3_BUCKET: "   " })).toEqual(["AWS_S3_BUCKET"]);
  });

  /**
   * Half a pair is the interesting case. The SDK drops it and falls back to ambient credentials,
   * so the deployment looks configured, boots, and fails on the first upload instead of at start.
   */
  it.each(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"])(
    "names %s when it is the half that is absent",
    (absent) => {
      const env = { ...S3_COMPLETE } as Record<string, string>;
      delete env[absent];

      expect(missingS3Settings(env)).toEqual([absent]);
    },
  );

  it("accepts neither half being set, which means ambient credentials on purpose", () => {
    expect(
      missingS3Settings({
        STORAGE_DRIVER: "s3",
        AWS_REGION: "af-south-1",
        AWS_S3_BUCKET: "sbr-documents",
      }),
    ).toEqual([]);
  });

  it("reports variable names and never their values, because this goes to the boot log", () => {
    const reported = missingS3Settings({ ...S3_COMPLETE, AWS_S3_BUCKET: "" }).join(" ");
    expect(reported).not.toContain("sbr-documents");
    expect(reported).not.toContain("secret-example");
  });
});

describe("assertStorageConfigured", () => {
  it("refuses to start on the local driver in production", () => {
    const result = harness({ APP_ENV: "production" });

    expect(result.refused).toBe(true);
    expect(result.errors.join("\n")).toContain("Refusing to start");
  });

  /**
   * The case the guard exists for. Nothing declares the environment, `resolveRuntimeEnvironment()`
   * answers `unknown`, and `unknown` is production, so forgetting to set APP_ENV on the new
   * infrastructure refuses the boot rather than quietly accepting documents onto a disk that will
   * be replaced. See ADR-0006.
   */
  it("refuses to start on the local driver when nothing declares the environment", () => {
    const result = harness({});

    expect(result.refused).toBe(true);
    expect(result.errors.join("\n")).toContain("undeclared environment is production by design");
  });

  it.each(["development", "test", "staging"])("allows the local driver in %s", (appEnv) => {
    const result = harness({ APP_ENV: appEnv });

    expect(result.refused).toBe(false);
    expect(result.errors).toEqual([]);
  });

  /**
   * Staging is deliberately allowed and deliberately separate from development. A preview
   * deployment is a real deployment on a real domain, and it uploads through the local driver
   * today; hardening it into a refused boot would break previews for a durability guarantee
   * nobody has asked a preview to make.
   */
  it("allows the local driver on a Vercel preview, which resolves to staging", () => {
    const result = harness({ VERCEL: "1", VERCEL_ENV: "preview" });

    expect(result.refused).toBe(false);
  });

  it("refuses the local driver on a Vercel production deployment", () => {
    const result = harness({ VERCEL: "1", VERCEL_ENV: "production" });

    expect(result.refused).toBe(true);
  });

  it("starts on a fully configured s3 driver in production", () => {
    const result = harness({ ...S3_COMPLETE, APP_ENV: "production" });

    expect(result.refused).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("refuses an s3 driver in production with no bucket", () => {
    const env = { ...S3_COMPLETE, APP_ENV: "production" } as Record<string, string>;
    delete env.AWS_S3_BUCKET;

    const result = harness(env);

    expect(result.refused).toBe(true);
    expect(result.errors.join("\n")).toContain("AWS_S3_BUCKET");
  });

  it("refuses an s3 driver in production with half a credential pair", () => {
    const env = { ...S3_COMPLETE, APP_ENV: "production" } as Record<string, string>;
    delete env.AWS_SECRET_ACCESS_KEY;

    const result = harness(env);

    expect(result.refused).toBe(true);
    expect(result.errors.join("\n")).toContain("AWS_SECRET_ACCESS_KEY");
  });

  it("does not check s3 settings outside production, where a half-set bucket is a work in progress", () => {
    const result = harness({ STORAGE_DRIVER: "s3", APP_ENV: "development" });

    expect(result.refused).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it("refuses an unrecognised driver in production", () => {
    const result = harness({ STORAGE_DRIVER: "gcs", APP_ENV: "production" });

    expect(result.refused).toBe(true);
    expect(result.errors.join("\n")).toContain("gcs");
  });

  /**
   * Outside production an unrecognised driver only warns, and it does warn: `StorageService`'s
   * constructor rejects it the moment anything asks for storage, and a sentence at boot is a
   * better way to learn that than a dependency injection failure four modules deep.
   */
  it("warns rather than refusing on an unrecognised driver outside production", () => {
    const result = harness({ STORAGE_DRIVER: "gcs", APP_ENV: "development" });

    expect(result.refused).toBe(false);
    expect(result.warnings.join("\n")).toContain("gcs");
  });

  it("names no configuration value in anything it logs", () => {
    const env = { ...S3_COMPLETE, APP_ENV: "production" } as Record<string, string>;
    delete env.AWS_SECRET_ACCESS_KEY;

    const logged = harness(env).errors.join("\n");

    expect(logged).not.toContain("sbr-documents");
    expect(logged).not.toContain("AKIA_EXAMPLE");
  });
});

/**
 * The predicate that replaced two direct reads of `process.env.VERCEL` inside `StorageService`.
 * It has to keep answering true on Vercel until the cutover finishes, and it has to be answerable
 * by an operator on a host that has never heard of Vercel.
 */
describe("hasEphemeralFilesystem", () => {
  it("is false on an ordinary host with nothing set", () => {
    expect(hasEphemeralFilesystem({})).toBe(false);
  });

  it("is true on Vercel, so preview and production uploads keep working through the cutover", () => {
    expect(hasEphemeralFilesystem({ VERCEL: "1" })).toBe(true);
  });

  it.each(["true", "1", "yes", "TRUE"])("is true when an operator declares %s", (value) => {
    expect(hasEphemeralFilesystem({ STORAGE_EPHEMERAL_FS: value })).toBe(true);
  });

  it.each(["false", "0", "no"])("is false when an operator declares %s", (value) => {
    expect(hasEphemeralFilesystem({ STORAGE_EPHEMERAL_FS: value })).toBe(false);
  });

  it("lets an explicit declaration override the vendor guess in both directions", () => {
    expect(hasEphemeralFilesystem({ VERCEL: "1", STORAGE_EPHEMERAL_FS: "false" })).toBe(false);
    expect(hasEphemeralFilesystem({ STORAGE_EPHEMERAL_FS: "true" })).toBe(true);
  });

  it("falls back to the vendor rather than to true when the declaration is not a yes or a no", () => {
    expect(hasEphemeralFilesystem({ STORAGE_EPHEMERAL_FS: "maybe" })).toBe(false);
    expect(hasEphemeralFilesystem({ STORAGE_EPHEMERAL_FS: "maybe", VERCEL: "1" })).toBe(true);
  });
});
