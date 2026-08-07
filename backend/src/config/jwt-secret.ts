/**
 * Fail-closed guard for the session-signing key.
 *
 * `JWT_SECRET` was the one credential with no boot guard. Unset, the API started
 * normally and signed every session token with a fallback literal that is public in
 * this repository, so anyone reading the source could forge a token for any user,
 * including an admin. The other three guards in this directory already refuse to
 * start a misconfigured production deploy; this one closes the last gap.
 *
 * Found while writing the environment matrix in E7-S5, tracked as E5-S6.
 * See docs/RUNBOOK.md §7.2.
 */

import { isProductionEnvironment } from "./runtime-environment";

/**
 * A 256-bit key expressed as text. Shorter secrets are brute-forceable offline
 * against a single captured token, and a forged token is a full account takeover.
 */
export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * The one development default, in one place. It is deliberately longer than
 * MIN_JWT_SECRET_LENGTH so that "somebody deployed the example file" is a distinct
 * rejection from "somebody chose a short secret" — the length rule would not catch it.
 * backend/.env.example ships this exact value, so copying the example into production
 * fails at boot instead of signing real sessions with a key published on GitHub.
 */
export const DEVELOPMENT_JWT_SECRET = "sbr-development-only-jwt-secret-do-not-deploy";

/** Why a configured value cannot sign production sessions. `null` means it can. */
export type JwtSecretRejection = "missing" | "development-fallback" | "too-short";

/**
 * Classifies a candidate secret without regard to environment. Returns `null` when the
 * value is fit for production. Whitespace-only counts as missing: an env var set to ""
 * or " " in a dashboard is an operator who thinks they have configured something.
 */
export function inspectJwtSecret(value: string | undefined): JwtSecretRejection | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return "missing";
  if (trimmed === DEVELOPMENT_JWT_SECRET) return "development-fallback";
  if (trimmed.length < MIN_JWT_SECRET_LENGTH) return "too-short";
  return null;
}

/**
 * The single resolution point for both signing (auth.module.ts) and verification
 * (jwt.strategy.ts). A configured value is returned verbatim — never trimmed — so that
 * changing this file can never invalidate tokens already signed with the old value.
 * Only an absent value falls back, and only outside production, because assertJwtSecret()
 * has already exited the process before any production request reaches here.
 */
export function resolveJwtSecret(value: string | undefined = process.env.JWT_SECRET): string {
  return value?.trim() ? value : DEVELOPMENT_JWT_SECRET;
}

const REJECTION_REASON: Record<JwtSecretRejection, string> = {
  missing: "JWT_SECRET is unset or empty.",
  "development-fallback":
    "JWT_SECRET is still the development default published in backend/.env.example.",
  "too-short": `JWT_SECRET is shorter than ${MIN_JWT_SECRET_LENGTH} characters.`,
};

type GuardDeps = {
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "error" | "warn">;
  exit?: (code: number) => never;
};

/**
 * Called from main.ts before the Nest application is created, alongside the database,
 * CORS and payment guards. Exits the process rather than throwing so a misconfigured
 * production deploy fails visibly at boot rather than serving forgeable sessions.
 *
 * Outside production it warns about a secret that is set but unusable, because that is
 * the value about to be promoted to production. A missing secret outside production is
 * the normal local state and stays silent.
 *
 * No message includes any part of the configured value. Length is reported because it is
 * metadata rather than content, and it is the difference between an operator who knows
 * why their secret was rejected and one who does not.
 */
export function assertJwtSecret(deps: GuardDeps = {}): void {
  const env = deps.env ?? process.env;
  const logger = deps.logger ?? console;
  const exit = deps.exit ?? ((code: number) => process.exit(code));

  const rejection = inspectJwtSecret(env.JWT_SECRET);

  if (!isProductionEnvironment(env)) {
    if (rejection === "too-short") {
      logger.warn(
        `\n[SafeBuyRealties] JWT_SECRET is ${env.JWT_SECRET?.trim().length} characters, ` +
          `and production requires at least ${MIN_JWT_SECRET_LENGTH}.\n` +
          "It works here, and it will stop the API from starting when it is deployed.\n",
      );
    }
    return;
  }

  if (rejection === null) return;

  logger.error(
    `\n[SafeBuyRealties] Refusing to start: ${REJECTION_REASON[rejection]}\n` +
      "Session tokens would be signed with a key that is public in this repository, so anyone\n" +
      "could forge a token for any user, including an admin.\n" +
      `Set JWT_SECRET to at least ${MIN_JWT_SECRET_LENGTH} characters of your own randomness ` +
      "(openssl rand -base64 48) and redeploy.\n" +
      "Rotating it logs every user out: all tokens are seven-day and signed with the old value.\n" +
      "See backend/.env.example and docs/RUNBOOK.md §7.2\n",
  );
  exit(1);
}
