import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import { isProductionEnvironment } from "./runtime-environment";

/**
 * CORS origin policy.
 *
 * The previous configuration used `origin: true`, which reflects back whatever Origin the
 * request carries. Combined with `credentials: true`, that let any website make authenticated
 * calls against this API using a visitor's session cookie.
 *
 * Allowed origins come from FRONTEND_URL as a comma-separated list, plus the Vercel preview
 * hostnames documented in backend/.env.example. In production the preview set narrows to the
 * team-slug form only — see matchesVercelPreview below for why the project-prefix form is
 * not safe there.
 */

/** Vercel project hostnames start with this, e.g. safebuyrealties-app.vercel.app. */
const VERCEL_PROJECT_PREFIX = "safebuyrealties";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * Request headers the browser may send. The frontend sets only Content-Type
 * (src/lib/api.ts:58); Authorization is allowed so a future bearer flow does not
 * fail with an opaque CORS error.
 */
export const ALLOWED_HEADERS = ["Content-Type", "Accept", "Authorization", "X-Requested-With"];

/**
 * Response headers the browser may read. Nothing reads a response header today,
 * so this is the minimum that keeps file downloads working if one is added.
 */
export const EXPOSED_HEADERS = ["Content-Disposition"];

export const ALLOWED_METHODS = ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"];

export interface CorsEnvironment {
  frontendUrl?: string;
  vercelTeamSlug?: string;
  appEnv?: string;
  nodeEnv?: string;
  vercelEnv?: string;
}

export function readCorsEnvironment(env: NodeJS.ProcessEnv = process.env): CorsEnvironment {
  return {
    frontendUrl: env.FRONTEND_URL,
    vercelTeamSlug: env.VERCEL_TEAM_SLUG,
    appEnv: env.APP_ENV,
    nodeEnv: env.NODE_ENV,
    vercelEnv: env.VERCEL_ENV,
  };
}

/**
 * Delegates to the shared definition in ./runtime-environment.ts rather than carrying a second
 * one. It kept its own before ADR-0006, which is how an undeclared environment could accept
 * localhost origins and squatted `safebuyrealties*.vercel.app` preview hostnames on a real server.
 */
export function isProductionLike(env: CorsEnvironment): boolean {
  return isProductionEnvironment({
    APP_ENV: env.appEnv,
    NODE_ENV: env.nodeEnv,
    VERCEL_ENV: env.vercelEnv,
  });
}

/** Reduces a URL to its canonical origin, or null when it is not a parseable absolute URL. */
function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

/** FRONTEND_URL is comma-separated. Entries are trimmed and empty entries dropped. */
export function parseAllowedOrigins(frontendUrl?: string): string[] {
  return (frontendUrl ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);
}

/**
 * Matches this project's Vercel preview hostnames.
 *
 * Two patterns exist, and only one of them is safe in production:
 *
 * - `*-${VERCEL_TEAM_SLUG}.vercel.app` — the team-slug suffix. A Vercel team slug is owned by
 *   the team that registered it, so this form cannot be obtained by an outsider. Accepted
 *   everywhere.
 * - `safebuyrealties*.vercel.app` — the bare project-name prefix. `.vercel.app` subdomains are
 *   globally first-come-first-served, so anyone may create a project named `safebuyrealties-evil`
 *   and own `safebuyrealties-evil.vercel.app`. Accepted **outside production only**, where it
 *   keeps local and preview workflows working; in production it would let a squatted hostname
 *   make credentialed cross-origin calls against the live API.
 *
 * In production the accepted set is therefore exactly: the FRONTEND_URL origins (checked by the
 * caller) plus the team-slug suffix form. With VERCEL_TEAM_SLUG unset in production no preview
 * origin is accepted at all — previews simply are not allowed, which is not a startup failure.
 *
 * Deliberately structural rather than a substring test. The hostname must be exactly three
 * labels ending in vercel.app, so evil-safebuyrealties.vercel.app.attacker.com (five labels)
 * and safebuyrealties.evil.vercel.app (four labels) are both rejected.
 */
function matchesVercelPreview(
  hostname: string,
  teamSlug: string | undefined,
  productionLike: boolean,
): boolean {
  const labels = hostname.split(".");
  if (labels.length !== 3) return false;
  if (labels[1] !== "vercel" || labels[2] !== "app") return false;

  const subdomain = labels[0];
  if (subdomain.length === 0) return false;

  // Squattable, so production never accepts it on the project prefix alone.
  if (!productionLike && subdomain.startsWith(VERCEL_PROJECT_PREFIX)) return true;

  const slug = teamSlug?.trim().toLowerCase();
  if (slug && subdomain.length > slug.length + 1 && subdomain.endsWith(`-${slug}`)) return true;

  return false;
}

export function isOriginAllowed(origin: string | undefined, env: CorsEnvironment): boolean {
  // No Origin header means this is not a browser cross-origin request: server-to-server
  // callers such as the Paystack webhook and platform health checks. Never blocked here.
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  if (parseAllowedOrigins(env.frontendUrl).includes(normalized)) return true;

  const url = new URL(normalized);
  const hostname = url.hostname.toLowerCase();
  const productionLike = isProductionLike(env);

  // Local dev and the test suite run the frontend on assorted ports.
  if (!productionLike && LOCAL_HOSTNAMES.has(hostname)) return true;

  // Vercel previews are always served over https.
  if (
    url.protocol === "https:" &&
    matchesVercelPreview(hostname, env.vercelTeamSlug, productionLike)
  ) {
    return true;
  }

  return false;
}

/**
 * Refuses to start in production without an allow-list, mirroring assertSafeDatabaseUrl()
 * in ./database-guard.ts.
 */
export function assertCorsConfigured(env: CorsEnvironment = readCorsEnvironment()): void {
  if (!isProductionLike(env)) return;
  if (parseAllowedOrigins(env.frontendUrl).length > 0) return;

  // console rather than the Nest logger, and the same in ./database-guard.ts: this runs during
  // module evaluation, before the application context exists, and the next statement exits.
  // eslint-disable-next-line no-console
  console.error(
    "\n[SafeBuyRealties] Refusing to start: FRONTEND_URL is unset or empty in production.\n" +
      "Set it to a comma-separated list of allowed browser origins, e.g.\n" +
      '  FRONTEND_URL="https://safebuyrealties-app.vercel.app"\n' +
      "Without it every cross-origin request from the frontend is rejected.\n" +
      "See backend/.env.example\n",
  );
  process.exit(1);
}

export function buildCorsOptions(env: CorsEnvironment = readCorsEnvironment()): CorsOptions {
  return {
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      // A rejected origin is answered without CORS headers rather than with an error,
      // so the browser blocks it and the server does not return a 500.
      callback(null, isOriginAllowed(origin, env));
    },
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: 600,
  };
}
