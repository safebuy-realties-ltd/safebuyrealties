/**
 * Fail-closed guard for object storage.
 *
 * The local driver writes uploaded documents to the filesystem of the process that received them.
 * On a developer's machine that is exactly right. In production it means a title deed lives on one
 * box, is invisible to every other box, and is gone the next time the process is replaced. The
 * platform's whole proposition is that a document uploaded yesterday is still there today, so
 * production refuses to start on the local driver rather than accepting documents it will lose.
 *
 * **The test is the environment, not the vendor.** E3-S2's original criterion 1 read "refuses to
 * start on a serverless platform with the local driver", which was the right shape while the
 * platform was serverless. A long-running process on a writable disk passes that test and loses
 * documents just the same, the moment there are two of them or the disk is not a backed-up volume.
 * `isProductionEnvironment()` from ADR-0006 is the predicate this wants, and an undeclared
 * environment reads as production, so forgetting to declare hardens rather than opens.
 *
 * See docs/adr/0006-deployment-target-and-runtime-environment.md and story E3-S2.
 */

import { isProductionEnvironment, resolveRuntimeEnvironment } from "./runtime-environment";

export type StorageDriverName = "local" | "s3";

/** What `STORAGE_DRIVER` resolves to. `unrecognised` carries the raw value for the message only. */
export type ResolvedStorageDriver =
  | { driver: StorageDriverName }
  | { driver: "unrecognised"; raw: string };

/**
 * Reads `STORAGE_DRIVER` the way `StorageService`'s constructor reads it, so the guard and the
 * service can never disagree about which driver is configured. Unset means local, which is the
 * developer default and the reason the guard exists.
 */
export function resolveStorageDriver(env: NodeJS.ProcessEnv = process.env): ResolvedStorageDriver {
  const raw = (env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (raw === "local" || raw === "s3") return { driver: raw };
  return { driver: "unrecognised", raw };
}

/**
 * Which required S3 settings are absent, by variable name.
 *
 * Names only, never values: this list is written to the boot log, and the log of a failed
 * production start is read by more people than the environment file is.
 */
export function missingS3Settings(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing: string[] = [];
  if (!env.AWS_REGION?.trim()) missing.push("AWS_REGION");
  if (!env.AWS_S3_BUCKET?.trim()) missing.push("AWS_S3_BUCKET");

  // Half a credential pair is silently dropped by the SDK, which then falls back to ambient
  // credentials and usually finds none. Whichever half is missing, this is a misconfiguration and
  // it should be a refused boot rather than a 502 on the first upload of the day.
  const hasKeyId = Boolean(env.AWS_ACCESS_KEY_ID?.trim());
  const hasSecret = Boolean(env.AWS_SECRET_ACCESS_KEY?.trim());
  if (hasKeyId !== hasSecret) {
    missing.push(hasKeyId ? "AWS_SECRET_ACCESS_KEY" : "AWS_ACCESS_KEY_ID");
  }
  return missing;
}

/**
 * Where the local driver writes when the filesystem does not survive the process.
 *
 * Absolute, because the whole point is that the working directory is not writable.
 */
export const EPHEMERAL_UPLOAD_ROOT = "/tmp/safebuyrealties-uploads";

/**
 * Whether this process's filesystem is thrown away when the process is.
 *
 * `StorageService` used to ask `process.env.VERCEL` this question in two places. That is a fact
 * about one vendor, and the vendor is being left, so it was going to become a fact about nothing.
 * The question the code actually needs answered is narrower and outlives the host: can a relative
 * upload path be written to at all, or does it have to be redirected to a scratch directory.
 *
 * Deleting the redirect outright would have been the obvious change and the wrong one. `VERCEL_ENV`
 * is `preview` on a preview deployment, which `resolveRuntimeEnvironment()` calls **staging** and
 * not production, so preview uploads run on the local driver quite legitimately and would have
 * started failing on a read-only filesystem with no test covering it.
 *
 * `STORAGE_EPHEMERAL_FS` is therefore what an operator sets, and `VERCEL` is read only as a last
 * resort while previews still run there, the same shape and for the same reason as `VERCEL_ENV` in
 * ./runtime-environment.ts. On the Nigerian infrastructure of ADR-0006 this is false and the
 * configured path is used as written.
 */
export function hasEphemeralFilesystem(env: NodeJS.ProcessEnv = process.env): boolean {
  const declared = env.STORAGE_EPHEMERAL_FS?.trim().toLowerCase();
  if (declared === "true" || declared === "1" || declared === "yes") return true;
  if (declared === "false" || declared === "0" || declared === "no") return false;
  return Boolean(env.VERCEL);
}

type GuardDeps = {
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "error" | "warn">;
  exit?: (code: number) => never;
};

/**
 * Called from main.ts before the Nest application is created, alongside the payments and database
 * guards. Exits the process rather than throwing, so a production deploy that would lose documents
 * fails visibly at boot instead of accepting the first upload.
 *
 * Outside production this only warns, and it warns about the unrecognised driver alone: a developer
 * on the local driver is doing the correct thing and should not be nagged about it.
 */
export function assertStorageConfigured(deps: GuardDeps = {}): void {
  const env = deps.env ?? process.env;
  const logger = deps.logger ?? console;
  const exit = deps.exit ?? ((code: number) => process.exit(code));

  const resolved = resolveStorageDriver(env);

  if (resolved.driver === "unrecognised") {
    // Outside production this is still wrong, and the service constructor will reject it the moment
    // anything asks for storage. Saying so at boot turns a confusing DI failure into a sentence.
    const line =
      `\n[SafeBuyRealties] STORAGE_DRIVER="${resolved.raw}" is not a driver this application has.\n` +
      'Set STORAGE_DRIVER to "s3" for any deployment, or "local" for development.\n';
    if (!isProductionEnvironment(env)) {
      logger.warn(line);
      return;
    }
    logger.error(`${line}Refusing to start.\n`);
    exit(1);
  }

  if (!isProductionEnvironment(env)) return;

  if (resolved.driver === "local") {
    logger.error(
      "\n[SafeBuyRealties] Refusing to start: the local storage driver in a production environment.\n" +
        `This environment resolves to "${resolveRuntimeEnvironment(env)}", and an undeclared environment is production by design.\n` +
        "The local driver writes uploaded documents to this process's own filesystem, where a second\n" +
        "instance cannot read them and a redeploy destroys them. Every title deed, due diligence report\n" +
        "and identity document uploaded would be lost without an error being raised.\n" +
        "Set STORAGE_DRIVER=s3 with AWS_REGION and AWS_S3_BUCKET (see backend/.env.example) and redeploy.\n" +
        "See docs/adr/0006-deployment-target-and-runtime-environment.md\n",
    );
    exit(1);
  }

  const missing = missingS3Settings(env);
  if (missing.length === 0) return;

  logger.error(
    "\n[SafeBuyRealties] Refusing to start: STORAGE_DRIVER=s3 in production with incomplete settings.\n" +
      `Missing or half-set: ${missing.join(", ")}.\n` +
      "Starting without these would accept uploads and fail every one of them at the gateway.\n" +
      "See backend/.env.example\n",
  );
  exit(1);
}
