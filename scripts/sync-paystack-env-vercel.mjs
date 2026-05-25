#!/usr/bin/env node
/**
 * Sync Paystack secret from backend/.env to Vercel API project (safebuyrealties).
 * Maps PAYSTACK_TEST_SECRET_KEY → PAYSTACK_SECRET_KEY on Vercel.
 *
 *   node scripts/sync-paystack-env-vercel.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, "backend/.env");

function parseEnv(file) {
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

if (!existsSync(envPath)) {
  console.error("Missing backend/.env — add PAYSTACK_TEST_SECRET_KEY or PAYSTACK_SECRET_KEY.");
  process.exit(1);
}

const env = parseEnv(envPath);
const secret = env.PAYSTACK_SECRET_KEY?.trim() || env.PAYSTACK_TEST_SECRET_KEY?.trim();
if (!secret) {
  console.error("No PAYSTACK_SECRET_KEY or PAYSTACK_TEST_SECRET_KEY in backend/.env");
  process.exit(1);
}

const backendDir = resolve(root, "backend");
const API_PROJECT_ID =
  process.env.VERCEL_API_PROJECT_ID ?? "prj_Y48L3TDfuZ5LsS8yyGA2mtEuTvGu";
const orgId = process.env.VERCEL_ORG_ID ?? "team_ZOR6qsUX3sPCxxpC2k6lypkK";
const targets = (process.env.VERCEL_ENV_TARGETS ?? "production,development").split(",");
const previewBranch = process.env.VERCEL_PREVIEW_BRANCH?.trim();

mkdirSync(resolve(backendDir, ".vercel"), { recursive: true });
writeFileSync(
  resolve(backendDir, ".vercel/project.json"),
  JSON.stringify({ projectId: API_PROJECT_ID, orgId }),
);

const valueArg = JSON.stringify(secret);
console.log(`Syncing PAYSTACK_SECRET_KEY to Vercel API project (${targets.join(", ")})…`);

for (const target of targets.map((t) => t.trim()).filter(Boolean)) {
  try {
    execSync(`vercel env rm PAYSTACK_SECRET_KEY ${target} --yes`, {
      cwd: backendDir,
      stdio: "pipe",
    });
  } catch {
    /* not set yet */
  }
  execSync(
    `vercel env add PAYSTACK_SECRET_KEY ${target} --value ${valueArg} --yes`,
    { cwd: backendDir, stdio: "inherit" },
  );
  console.log(`  ✓ ${target}`);
}

if (previewBranch) {
  try {
    execSync(`vercel env rm PAYSTACK_SECRET_KEY preview ${previewBranch} --yes`, {
      cwd: backendDir,
      stdio: "pipe",
    });
  } catch {
    /* not set */
  }
  execSync(
    `vercel env add PAYSTACK_SECRET_KEY preview ${previewBranch} --value ${valueArg} --yes`,
    { cwd: backendDir, stdio: "inherit" },
  );
  console.log(`  ✓ preview (branch ${previewBranch})`);
} else {
  console.log(
    "  ℹ Preview: set VERCEL_PREVIEW_BRANCH=<branch> to sync PR preview, or add in Vercel dashboard.",
  );
}

console.log("Done. Redeploy the safebuyrealties (API) project for changes to apply.");
