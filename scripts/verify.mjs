#!/usr/bin/env node
/**
 * verify.mjs
 *
 * Rule 13. Run everything CI runs, before CI runs it.
 *
 * This exists because of a specific failure rather than a general principle. #156 was pushed after
 * a build, a full test run, the board check and the prose check all passed locally, and CI failed
 * on six prettier errors in the two files the story had added. The gate that caught them was the
 * backend half of the lint job, which had landed in #151 while that branch was already cut. The
 * local checklist was hand-maintained, CI's list had moved, and nothing connected the two.
 *
 * A longer checklist would not have fixed that. The checklist was not too short, it was a copy,
 * and copies drift. So this file is the one list, the CI workflow is the other, and they are meant
 * to be read against each other whenever a job is added. The `ciJob` field on each gate is the
 * name of the job in .github/workflows/ci.yml that runs the same command, so the comparison is a
 * grep rather than an act of memory.
 *
 * The two end-to-end jobs cannot run here: they need a database and a browser that CI provisions.
 * They are listed anyway, and printed as skipped at the end. A verification summary that quietly
 * omits what it did not check is how somebody concludes they are green when they are not, and this
 * whole file is an argument against that habit.
 *
 * Usage:
 *   npm run verify           everything runnable on a laptop
 *   npm run verify -- --fast skip the two test suites, for a docs-only change
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = join(ROOT, "backend");
const FAST = process.argv.includes("--fast");

/**
 * Every gate CI applies to a pull request. Keep this in step with .github/workflows/ci.yml: if you
 * add a job there, add it here, and if you cannot run it on a laptop say so with `local: false`
 * rather than leaving it out.
 */
const GATES = [
  { ciJob: "frontend-typecheck", what: "TypeScript, frontend", cmd: "npx", args: ["tsc", "--noEmit"], cwd: ROOT, local: true },
  { ciJob: "backend-check", what: "TypeScript, backend", cmd: "npx", args: ["tsc", "--noEmit"], cwd: BACKEND, local: true },
  { ciJob: "lint", what: "ESLint and Prettier, both trees", cmd: "npx", args: ["eslint", "src", "backend/src", "--max-warnings", "0"], cwd: ROOT, local: true },
  { ciJob: "frontend-test", what: "Vitest with coverage", cmd: "npm", args: ["run", "test:cov"], cwd: ROOT, local: true, slow: true },
  { ciJob: "frontend-test", what: "Diff coverage, frontend", cmd: "node", args: ["scripts/diff-coverage.mjs", "--scope", "frontend"], cwd: ROOT, local: true, slow: true },
  { ciJob: "backend-check", what: "Jest with coverage", cmd: "npm", args: ["run", "test:cov"], cwd: BACKEND, local: true, slow: true },
  { ciJob: "backend-check", what: "Diff coverage, backend", cmd: "node", args: ["../scripts/diff-coverage.mjs", "--scope", "backend"], cwd: BACKEND, local: true, slow: true },
  { ciJob: "backend-check", what: "Nest build", cmd: "npm", args: ["run", "build"], cwd: BACKEND, local: true, slow: true },
  { ciJob: "board", what: "Board is internally consistent", cmd: "node", args: ["scripts/check-board.mjs"], cwd: ROOT, local: true },
  { ciJob: "prose", what: "Prose rules 9 and 10", cmd: "node", args: ["scripts/check-prose.mjs"], cwd: ROOT, local: true },
  { ciJob: "security", what: "Rule 11, dependency advisories", cmd: "node", args: ["scripts/check-security.mjs"], cwd: ROOT, local: true },
  { ciJob: "e2e-api", what: "End-to-end journeys over the API", local: false, why: "needs a seeded database CI provisions" },
  { ciJob: "e2e-browser", what: "End-to-end journeys in a browser", local: false, why: "needs Playwright browsers and a running app" },
  { ciJob: "reports", what: "Rule 12, reports match main", local: false, why: "runs on main after the merge, not on the pull request" },
];

const label = (gate) => `${gate.what} (${gate.ciJob})`;
const results = [];

for (const gate of GATES) {
  if (!gate.local) continue;
  if (FAST && gate.slow) {
    results.push({ gate, status: "skipped", why: "--fast" });
    console.log(`SKIP  ${label(gate)}`);
    continue;
  }

  process.stdout.write(`....  ${label(gate)}\n`);
  const run = spawnSync(gate.cmd, gate.args, { cwd: gate.cwd, stdio: "inherit", shell: process.platform === "win32" });
  const ok = run.status === 0;
  results.push({ gate, status: ok ? "passed" : "failed" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label(gate)}\n`);
}

// ---------------------------------------------------------------------------

const failed = results.filter((r) => r.status === "failed");
const skipped = results.filter((r) => r.status === "skipped");
const notLocal = GATES.filter((g) => !g.local);

console.log("-".repeat(72));
console.log(`${results.filter((r) => r.status === "passed").length} passed, ${failed.length} failed, ${skipped.length} skipped here.`);

for (const gate of notLocal) console.log(`  not run: ${label(gate)}, ${gate.why}`);
for (const item of skipped) console.log(`  not run: ${label(item.gate)}, ${item.why}`);

if (failed.length) {
  console.log("");
  for (const item of failed) console.log(`  FAILED: ${label(item.gate)}`);
  console.log("\nFix these before pushing. CI runs the same commands and will reach the same answer.");
  process.exit(1);
}

console.log("\nEverything runnable here passed. Rule 13 asks for one more thing: after gh pr create,");
console.log("watch the run to a conclusion rather than stopping at the push.");
