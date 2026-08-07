import { isDevelopmentOrTest } from "./runtime-environment";

/**
 * Prevents accidental use of a remote database in development without explicit opt-in.
 * Set SBR_CONFIRM_CLOUD_DATABASE_URL=true in backend/.env when using shared cloud Postgres locally.
 *
 * This runs on a developer's machine and under the test runner, and nowhere else. It used to run
 * anywhere NODE_ENV was not exactly "production", which included every undeclared environment, so
 * a real deployment that had not set NODE_ENV hit it and refused to boot. The message below then
 * told the operator to set SBR_CONFIRM_CLOUD_DATABASE_URL=true, which got the process started and
 * left every other NODE_ENV-keyed default in its development state. See ADR-0006.
 */
export function assertSafeDatabaseUrl(): void {
  if (!isDevelopmentOrTest()) return;

  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url) return;

  if (process.env.SBR_CONFIRM_CLOUD_DATABASE_URL === "true") return;

  const isLocalHost = /localhost|127\.0\.0\.1/.test(url);
  if (!isLocalHost) {
    // eslint-disable-next-line no-console
    console.error(
      "\n[SafeBuyRealties] Refusing to start: DATABASE_URL points to a non-local database.\n" +
        "This check runs in development and test only, so you are seeing it on a developer machine.\n" +
        "If that is what you meant, set SBR_CONFIRM_CLOUD_DATABASE_URL=true in backend/.env\n" +
        "If this is a deployment, declare it instead: APP_ENV=production (or staging).\n" +
        "See docs/LOCAL_DEVELOPMENT.md\n",
    );
    process.exit(1);
  }
}
