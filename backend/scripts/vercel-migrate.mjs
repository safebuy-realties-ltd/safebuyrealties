/**
 * Apply migrations during Vercel build. Uses DATABASE_POSTGRES_URL when set
 * (direct connection from Vercel Storage); falls back to DATABASE_URL.
 */
import { execSync } from "node:child_process";

const direct = process.env.DATABASE_POSTGRES_URL?.trim();
const pooled = process.env.DATABASE_URL?.trim();
const url = direct || pooled;

if (!url) {
  console.warn("[vercel-migrate] No DATABASE_URL or DATABASE_POSTGRES_URL; skipping migrate deploy.");
  process.exit(0);
}

process.env.DATABASE_URL = url;
if (!process.env.DATABASE_POSTGRES_URL) {
  process.env.DATABASE_POSTGRES_URL = url;
}

console.log("[vercel-migrate] Running prisma migrate deploy…");
execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
