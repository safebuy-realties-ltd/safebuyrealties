/**
 * Skip backend Vercel builds when only frontend (non-backend) paths changed.
 * Exit 0 = skip build, exit 1 = run build.
 */
import { execSync } from "node:child_process";

const sha = process.env.VERCEL_GIT_COMMIT_SHA;
const prev = process.env.VERCEL_GIT_PREVIOUS_SHA;

if (!sha || !prev) {
  process.exit(1);
}

let files;
try {
  files = execSync(`git diff --name-only ${prev} ${sha}`, { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
} catch {
  process.exit(1);
}

if (files.length === 0) {
  process.exit(1);
}

const touchesBackend = files.some((f) => f.startsWith("backend/"));
process.exit(touchesBackend ? 1 : 0);
