#!/usr/bin/env node
/**
 * check-reports.mjs
 *
 * Rule 12. The reports under docs/reports/ describe the state of main, and a document that
 * describes the state of main cannot be written correctly inside a pull request that has not
 * merged yet. That is not a discipline problem, it is an ordering one, and it is why rule 8 could
 * never have covered these files.
 *
 * So this check runs on main rather than on pull requests, and it fails main until the reports
 * catch up. The three rule 8 documents ship inside the diff because they can. These four families
 * ship after it because they cannot.
 *
 * What it compares: the board header names the commit of main it was verified against, and
 * check-board.mjs already forces that to be exactly one real commit. Each report carries the same
 * marker. When the board moves and a report does not, that report is describing a state of the
 * world that no longer exists, and it says so out loud rather than waiting to be caught by a
 * stakeholder reading a merged story as still blocked.
 *
 * The marker is an HTML comment so it survives in both the html and the markdown members and stays
 * out of the rendered page:
 *
 *     <!-- report-state: sha=df39ada -->
 *
 * On the published artifact: it is not a file in this repository, so nothing here can check it.
 * The rule names it anyway, because leaving it out of the written rule is how it gets forgotten,
 * and an obligation nobody wrote down is one nobody discharges.
 *
 * Usage:
 *   node scripts/check-reports.mjs            fail when a report is behind the board
 *   node scripts/check-reports.mjs --report   print the state and always exit 0
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOARD = join(ROOT, "docs", "mvp-board.html");
const REPORT_ONLY = process.argv.includes("--report");

/**
 * The tracked members of each report family. The pdf, png and docx members are generated from
 * these and are gitignored (.gitignore lines 56 to 58), so they cannot be checked here. The rule
 * says to regenerate them; only the sources can be enforced.
 */
const REPORTS = [
  "docs/reports/build-state.html",
  "docs/reports/build-state.md",
  "docs/reports/what-is-needed.html",
  "docs/reports/what-is-needed.md",
  "docs/reports/remaining-work.html",
];

const failures = [];
const fail = (message) => failures.push(message);

// ---------------------------------------------------------------------------
// What the board says main is

let boardSha = null;
try {
  const source = readFileSync(BOARD, "utf8");
  const header = source.match(/<header[\s\S]*?<\/header>/);
  const shas = header ? [...new Set([...header[0].matchAll(/\b[0-9a-f]{7,40}\b/g)].map((m) => m[0]))] : [];
  if (shas.length === 1) boardSha = shas[0];
} catch (error) {
  console.error(`Cannot read ${BOARD}: ${error.message}`);
  process.exit(1);
}

if (!boardSha) {
  // check-board.mjs owns this failure and says it better. Do not report the same fault twice.
  console.log("Reports check: the board header names no single commit, so there is nothing to compare against.");
  console.log("Run npm run validate:board. That check owns this one.");
  process.exit(0);
}

/** Two markers match when one is a prefix of the other, because 7 and 40 hex are the same commit. */
const sameCommit = (a, b) => a.startsWith(b) || b.startsWith(a);

const isAncestorOfHead = (sha) => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// What each report says it describes

const state = [];
for (const path of REPORTS) {
  const full = join(ROOT, path);
  let source;
  try {
    source = readFileSync(full, "utf8");
  } catch {
    fail(`${path} is listed in rule 12 but is not in the repository. Either regenerate it or take it off the list in ${relative(ROOT, fileURLToPath(import.meta.url))}.`);
    continue;
  }

  const marker = source.match(/<!--\s*report-state:\s*sha=([0-9a-f]{7,40})\s*-->/);
  if (!marker) {
    fail(`${path} carries no report-state marker. Add "<!-- report-state: sha=${boardSha} -->" near the top, so a reader and this check can both tell what it describes.`);
    continue;
  }

  const sha = marker[1];
  state.push({ path, sha });

  if (sameCommit(sha, boardSha)) continue;

  const behind = isAncestorOfHead(sha)
    ? "It is an older commit, so this report is behind."
    : "That commit is not in this history at all, so the marker is wrong as well as stale.";
  fail(`${path} describes ${sha} and the board describes ${boardSha}. ${behind}\n      Re-derive it against main, move the marker, and republish the artifact with it.`);
}

// ---------------------------------------------------------------------------
// Output

console.log(`Reports check: the board describes ${boardSha}, and ${state.length} of ${REPORTS.length} reports carry a marker.`);
for (const item of state) {
  const flag = sameCommit(item.sha, boardSha) ? "current" : "BEHIND";
  console.log(`  ${flag.padEnd(7)} ${item.path} at ${item.sha}`);
}

if (failures.length && !REPORT_ONLY) {
  console.error("");
  for (const message of failures) console.error(`  FAIL ${message}`);
  console.error("");
  console.error(`${failures.length} report${failures.length === 1 ? " is" : "s are"} out of date with main. Rule 12 is in docs/HANDOVER_WEEK.md.`);
  console.error("The published artifact is not in this repository and is not checked here. Republish it too.");
  process.exit(1);
}

if (failures.length) {
  console.log(`\n${failures.length} would fail, and --report was passed, so this exits clean.`);
}
console.log("Reports check passed.");
