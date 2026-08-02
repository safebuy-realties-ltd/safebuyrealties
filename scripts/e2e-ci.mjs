#!/usr/bin/env node
/**
 * E7-S3. Runs the end-to-end journeys and says which of them passed.
 *
 *   node scripts/e2e-ci.mjs                 every journey
 *   node scripts/e2e-ci.mjs --kind api      the four that go through the API only
 *   node scripts/e2e-ci.mjs --kind browser  the one that goes through the app
 *   node scripts/e2e-ci.mjs --only guest-checkout
 *   node scripts/e2e-ci.mjs --list
 *
 * Why this exists rather than five `run:` lines in the workflow. Three reasons, and the third is
 * the one that mattered. The scripts print in three different formats, so a person reading a failed
 * CI run had to know which script used which. Each one's output needs to land in a file for the
 * artifact upload, and doing that with shell redirection loses the console. And `--kind` is what
 * lets the workflow split the browser journey into its own job, which is what keeps the pull
 * request path inside criterion 6's ten minutes.
 *
 * Environment, all with working defaults for a local run against `npm run dev`:
 *   SBR_API_BASE           default http://localhost:3001/api/v1
 *   SBR_APP_URL            default http://localhost:8080
 *   SBR_E2E_ARTIFACT_DIR   default artifacts/e2e
 *   SBR_E2E_STRICT         1 to count a `partial` result as a failure. CI sets it; see below.
 */
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPTS_DIR, "..");

/**
 * Criterion 3 names five journeys. Four processes prove them, because the seller's listing and the
 * staff verification of that listing are one flow: splitting them into two processes would leave
 * the staff half with nothing to verify. So `staff-verification` names the process that proves it
 * rather than a second copy of it, and the summary below reports both journeys either way.
 */
const JOURNEYS = [
  {
    id: "buyer-purchase",
    name: "Buyer on-platform purchase",
    kind: "api",
    script: "journey-e2e-all-roles.mjs",
  },
  {
    id: "seller-listing-to-live",
    name: "Seller listing to live",
    kind: "api",
    script: "listing-lifecycle-e2e.mjs",
  },
  {
    id: "staff-verification",
    name: "Staff verification",
    kind: "api",
    script: "listing-lifecycle-e2e.mjs",
    provenBy: "seller-listing-to-live",
  },
  {
    id: "standalone-dd",
    name: "Standalone due diligence",
    kind: "browser",
    script: "dd-checklist-e2e.mjs",
  },
  {
    id: "guest-checkout",
    name: "Guest checkout",
    kind: "api",
    script: "guest-checkout-e2e.mjs",
  },
];

function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv.includes("--list")) {
  for (const j of JOURNEYS) {
    const via = j.provenBy ? ` (proven by ${j.provenBy})` : "";
    console.log(`${j.id.padEnd(24)} ${j.kind.padEnd(8)} ${j.name}${via}`);
  }
  process.exit(0);
}

const kind = flag("kind");
const only = flag("only");
if (kind && !["api", "browser"].includes(kind)) {
  console.error(`unknown --kind ${kind}. Use api or browser.`);
  process.exit(2);
}
if (only && !JOURNEYS.some((j) => j.id === only)) {
  console.error(`unknown --only ${only}. Run --list to see the ids.`);
  process.exit(2);
}

const selected = JOURNEYS.filter(
  (j) => (!kind || j.kind === kind) && (!only || j.id === only || j.provenBy === only),
);

const artifactDir = resolve(
  REPO_ROOT,
  process.env.SBR_E2E_ARTIFACT_DIR ?? join("artifacts", "e2e"),
);
mkdirSync(artifactDir, { recursive: true });
// Clear what this run is about to write, and only that. Deleting the whole directory would be
// simpler and would also delete the API's log and the dev server's log, which CI writes into it
// before calling this script and which are half of what a person needs when a journey fails.
for (const journey of selected) {
  rmSync(join(artifactDir, `${journey.id}.log`), { force: true });
  rmSync(join(artifactDir, journey.id), { recursive: true, force: true });
}

const strict = process.env.SBR_E2E_STRICT === "1";
const kindNote = kind ? `, kind=${kind}` : "";
console.log(`e2e: ${selected.length} journey(s)${kindNote}`);
console.log(`     API  ${process.env.SBR_API_BASE ?? "http://localhost:3001/api/v1"}`);
if (selected.some((j) => j.kind === "browser")) {
  console.log(`     app  ${process.env.SBR_APP_URL ?? "http://localhost:8080"}`);
}
console.log(`     logs ${artifactDir}`);
console.log(`     strict ${strict ? "on, a partial result fails" : "off, a partial result passes"}`);
console.log("");

/** Runs one script, teeing its output to the console and to a file the artifact upload picks up. */
function run(journey) {
  return new Promise((resolveRun) => {
    const logPath = join(artifactDir, `${journey.id}.log`);
    const logFile = createWriteStream(logPath);
    const started = process.hrtime.bigint();

    const child = spawn(process.execPath, [join(SCRIPTS_DIR, journey.script)], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        // Each browser journey gets its own directory so one journey's screenshots cannot
        // overwrite another's, and so the failure shot sits beside the log that explains it.
        SBR_E2E_ARTIFACT_DIR: join(artifactDir, journey.id),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const tee = (stream, sink) => {
      stream.on("data", (chunk) => {
        sink.write(chunk);
        logFile.write(chunk);
      });
    };
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);

    child.on("close", (code) => {
      logFile.end();
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      resolveRun({ code: code ?? 1, seconds, logPath });
    });
    child.on("error", (err) => {
      logFile.write(`spawn failed: ${err.message}\n`);
      logFile.end();
      resolveRun({ code: 1, seconds: 0, logPath });
    });
  });
}

// Sequentially, not in parallel. They share one database and one API process, and the listing
// lifecycle asserts on queue counts that another journey writing at the same time would move.
const outcomes = new Map();
for (const journey of selected) {
  if (journey.provenBy) continue;
  console.log(`\n=== ${journey.name} (${journey.script}) ===`);
  // eslint-disable-next-line no-await-in-loop
  outcomes.set(journey.id, await run(journey));
}

console.log("\n--- journeys ---");
let failed = 0;
for (const journey of selected) {
  const outcome = outcomes.get(journey.provenBy ?? journey.id);
  const ok = outcome?.code === 0;
  if (!ok) failed += 1;
  const took = journey.provenBy ? "same run" : `${outcome.seconds.toFixed(1)}s`;
  console.log(`${ok ? "PASS" : "FAIL"}  ${journey.name.padEnd(30)} ${took}`);
}

const total = [...outcomes.values()].reduce((sum, o) => sum + o.seconds, 0);
console.log(`\n${selected.length - failed}/${selected.length} journeys passed in ${total.toFixed(1)}s`);
if (failed > 0) console.log(`Logs and screenshots: ${artifactDir}`);
process.exit(failed > 0 ? 1 : 0);
