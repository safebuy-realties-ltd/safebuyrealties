/**
 * Prevents accidental use of a remote database in development without explicit opt-in.
 * Set SBR_CONFIRM_CLOUD_DATABASE_URL=true in backend/.env when using shared cloud Postgres locally.
 */
export function assertSafeDatabaseUrl(): void {
  if (process.env.NODE_ENV === "production") return;

  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url) return;

  if (process.env.SBR_CONFIRM_CLOUD_DATABASE_URL === "true") return;

  const isLocalHost = /localhost|127\.0\.0\.1/.test(url);
  if (!isLocalHost) {
    // eslint-disable-next-line no-console
    console.error(
      "\n[SafeBuyRealties] Refusing to start: DATABASE_URL points to a non-local database.\n" +
        "For shared cloud Postgres in local dev, set SBR_CONFIRM_CLOUD_DATABASE_URL=true in backend/.env\n" +
        "See docs/LOCAL_DEVELOPMENT.md\n",
    );
    process.exit(1);
  }
}
