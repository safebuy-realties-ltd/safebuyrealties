/**
 * Base URL embedded in every Power of Attorney QR code.
 *
 * Resolution order: POA_VERIFY_BASE_URL, then the first origin in FRONTEND_URL
 * with /verify appended, then the historic hard-coded default.
 */
const DEFAULT_VERIFY_BASE_URL = "https://safebuyrealties.com/verify";
const VERIFY_PATH = "/verify";

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function firstFrontendOrigin(frontendUrl?: string): string | null {
  const first = (frontendUrl ?? "").split(",")[0]?.trim();
  if (!first) return null;
  try {
    return new URL(first).origin;
  } catch {
    return null;
  }
}

export function resolveVerifyBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.POA_VERIFY_BASE_URL?.trim();
  if (explicit) return stripTrailingSlashes(explicit) || DEFAULT_VERIFY_BASE_URL;

  const origin = firstFrontendOrigin(env.FRONTEND_URL);
  if (origin) return `${origin}${VERIFY_PATH}`;

  return DEFAULT_VERIFY_BASE_URL;
}
