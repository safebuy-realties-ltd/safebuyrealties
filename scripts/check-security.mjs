#!/usr/bin/env node
/**
 * check-security.mjs
 *
 * Rule 11. Every pull request is measured against the dependency advisories that apply to this
 * repository, and every advisory that is still open has been read by a person, tagged with its CWE
 * and its OWASP category, and given a date by which somebody looks at it again.
 *
 * This is a ratchet, not a threshold, and the difference matters enough to write down.
 *
 * The obvious version of this check is `npm audit --audit-level=high`. On the day it was written
 * that command failed on 23 advisories at the root and 8 in the backend, none of which the pull
 * request in front of it had introduced. A gate that fails every pull request for something the
 * author did not do is a gate somebody disables inside a week, and rule 8 says out loud that a gate
 * people route around is worse than no gate. So what this checks is movement rather than absence:
 *
 *   1. An advisory nobody has assessed fails. That is the ratchet. The dependency posture cannot
 *      get worse without a person writing down that they looked.
 *   2. An assessed advisory whose reviewBy date has passed fails. That is what stops the baseline
 *      turning into a list of things everyone agreed to stop thinking about.
 *   3. An advisory assessed as reachable at high or critical must name the story that fixes it.
 *      Accepting reachable risk is allowed. Accepting it without filing the work is not.
 *
 * An advisory that has been fixed upstream and no longer appears is reported as a note rather than
 * a failure. Failing the build on good news teaches people the wrong reflex, and the note is loud
 * enough that pruning the entry happens on the next pass.
 *
 * On the registry being unreachable: this exits 0 with a warning. `npm audit` is a network call to
 * a service this project does not run, and a check that goes red when somebody else has an outage
 * is a check people learn to re-run until it passes, which is the same disease as a check that is
 * always red. The scheduled run on main covers the window.
 *
 * Reachability is the field that separates this from an audit dump. `npm audit` reports what is in
 * the tree. It does not know that nodemailer's vulnerable option is never passed anywhere in this
 * backend, or that multer's is on the path that accepts KYC identity documents. Somebody has to
 * look, and the baseline is where they record what they saw.
 *
 * Usage:
 *   node scripts/check-security.mjs            fail on anything new, expired or unfiled
 *   node scripts/check-security.mjs --report   print the posture and always exit 0
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "docs", "security", "advisory-baseline.json");
const REPORT_ONLY = process.argv.includes("--report");

/** Workspaces this repository installs separately, so each has its own tree and its own audit. */
const WORKSPACES = [
  { name: "root", cwd: ROOT },
  { name: "backend", cwd: join(ROOT, "backend") },
];

const failures = [];
const notes = [];
const fail = (message) => failures.push(message);

// ---------------------------------------------------------------------------
// Reading the baseline

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch (error) {
  console.error(`Cannot read ${BASELINE}: ${error.message}`);
  console.error("Rule 11 needs a baseline. There is a template in docs/HANDOVER_WEEK.md.");
  process.exit(1);
}

const REQUIRED_FIELDS = ["id", "package", "workspace", "severity", "cwe", "owasp", "reachable", "why", "reviewBy"];
const REACHABLE_VALUES = ["yes", "no", "unproven"];

const accepted = new Map();
for (const [index, entry] of (baseline.advisories ?? []).entries()) {
  for (const field of REQUIRED_FIELDS) {
    const value = entry[field];
    const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) fail(`advisories[${index}] (${entry.id ?? "no id"}) has no ${field}`);
  }
  if (!REACHABLE_VALUES.includes(entry.reachable)) {
    fail(`advisories[${index}] (${entry.id}) has reachable "${entry.reachable}", which must be one of ${REACHABLE_VALUES.join(", ")}`);
  }
  accepted.set(`${entry.workspace}:${entry.id}:${entry.package}`, { ...entry, seen: false });
}

// ---------------------------------------------------------------------------
// Reading the trees
//
// `npm audit --json` exits non-zero whenever it finds anything, which is almost always, so the
// exit code carries no information here and the output is what matters. Two shapes have shipped:
// npm 6 put findings under `advisories`, npm 7 and later put them under `vulnerabilities` with the
// detail in `via`. Both are handled because the version in CI and the version on somebody's laptop
// are not always the same one.

/** GHSA identifiers live in the advisory url rather than in a field of their own. */
const ghsaFrom = (url) => (typeof url === "string" ? (url.match(/GHSA-[0-9a-z-]+/i)?.[0] ?? null) : null);

function auditTree(workspace) {
  let raw;
  try {
    raw = execFileSync("npm", ["audit", "--json"], {
      cwd: workspace.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // Findings make npm exit non-zero and still print the report on stdout. That is the normal path.
    raw = error.stdout ?? "";
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // Unreachable registry, or a tree that was never installed. Handled by the caller.
  }

  const found = [];
  for (const [name, record] of Object.entries(parsed.vulnerabilities ?? {})) {
    for (const via of record.via ?? []) {
      if (typeof via !== "object" || via === null) continue; // A string via is an indirection, not a finding.
      const id = ghsaFrom(via.url);
      if (!id) continue;
      found.push({
        id,
        package: via.name ?? name,
        severity: via.severity ?? record.severity ?? "unknown",
        title: via.title ?? "",
        cwe: Array.isArray(via.cwe) ? via.cwe : [],
        fixAvailable: Boolean(record.fixAvailable),
      });
    }
  }
  for (const [, record] of Object.entries(parsed.advisories ?? {})) {
    const id = ghsaFrom(record.url) ?? record.github_advisory_id;
    if (!id) continue;
    found.push({
      id,
      package: record.module_name,
      severity: record.severity,
      title: record.title ?? "",
      cwe: record.cwe ? [record.cwe].flat() : [],
      fixAvailable: true,
    });
  }

  // One advisory can arrive once per dependent, so collapse to one row per package and id.
  const unique = new Map();
  for (const item of found) unique.set(`${item.id}:${item.package}`, item);
  return [...unique.values()];
}

const today = new Date(process.env.SECURITY_TODAY ?? Date.now()).toISOString().slice(0, 10);
let registryReachable = true;
const live = [];

for (const workspace of WORKSPACES) {
  const found = auditTree(workspace);
  if (found === null) {
    registryReachable = false;
    notes.push(`${workspace.name}: npm audit produced no readable report, so this tree was not measured`);
    continue;
  }
  for (const item of found) live.push({ ...item, workspace: workspace.name });
}

if (!registryReachable && live.length === 0) {
  console.log("Security check: the registry could not be reached, so nothing was measured.");
  console.log("This exits clean on purpose. The scheduled run on main covers the window.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// The three rules

for (const item of live) {
  const key = `${item.workspace}:${item.id}:${item.package}`;
  const entry = accepted.get(key);
  if (!entry) {
    fail(
      `${item.workspace}: ${item.id} in ${item.package} (${item.severity}${item.cwe.length ? ", " + item.cwe.join(" ") : ""}) is not in the baseline.\n` +
        `      ${item.title}\n` +
        `      Fix it, or read it and add an entry to docs/security/advisory-baseline.json saying whether this codebase can reach it.`,
    );
    continue;
  }
  entry.seen = true;
  if (entry.reviewBy < today) {
    fail(`${item.workspace}: ${item.id} in ${item.package} was accepted until ${entry.reviewBy}, which has passed. Read it again and move the date or fix it.`);
  }
  // Reachable and serious means somebody has to be doing something about it. So does anything
  // critical that has not been proved unreachable, because "we think it probably cannot be
  // driven" is a sentence that should come with a ticket attached.
  const reachableAndSerious = entry.reachable === "yes" && (entry.severity === "high" || entry.severity === "critical");
  const unprovedCritical = entry.severity === "critical" && entry.reachable !== "no";
  if ((reachableAndSerious || unprovedCritical) && !entry.story) {
    const which = reachableAndSerious ? `reachable at ${entry.severity}` : "critical and not proved unreachable";
    fail(`${item.workspace}: ${item.id} in ${item.package} is ${which} with no story named. Accepting risk is allowed. Accepting it without filing the work is not.`);
  }
}

for (const [key, entry] of accepted) {
  if (entry.seen) continue;
  notes.push(`${key.split(":")[0]}: ${entry.id} in ${entry.package} is in the baseline but no longer in the tree. It has been fixed upstream, so delete the entry.`);
}

// ---------------------------------------------------------------------------
// Output

const counts = live.reduce((acc, item) => ({ ...acc, [item.severity]: (acc[item.severity] ?? 0) + 1 }), {});
const order = ["critical", "high", "moderate", "low", "info", "unknown"];
const summary = order.filter((s) => counts[s]).map((s) => `${s} ${counts[s]}`).join(", ") || "nothing open";

console.log(`Security check: ${live.length} advisories across ${WORKSPACES.length} trees (${summary}).`);
console.log(`Baseline: ${accepted.size} assessed, ${[...accepted.values()].filter((e) => e.reachable === "yes").length} of them reachable from this codebase.`);

for (const note of notes) console.log(`  note: ${note}`);

if (failures.length && !REPORT_ONLY) {
  console.error("");
  for (const message of failures) console.error(`  FAIL ${message}`);
  console.error("");
  console.error(`${failures.length} problem${failures.length === 1 ? "" : "s"}. Rule 11 is in docs/HANDOVER_WEEK.md.`);
  process.exit(1);
}

if (failures.length) {
  console.log(`\n${failures.length} would fail, and --report was passed, so this exits clean.`);
}
console.log("Security check passed.");
