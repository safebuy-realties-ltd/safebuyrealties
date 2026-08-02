#!/usr/bin/env node
/**
 * Diff coverage: the bar on new and changed code.
 *
 * E7-S2 put a floor under each suite, which stops coverage falling. A floor alone does not stop the
 * gap accruing: a new file with no tests passes as long as it does not drag the average below where
 * it already is, and at a frontend floor of 4.91% almost anything clears that. This measures only
 * the lines a pull request touched, and holds those to a strict bar.
 *
 * Neither runner can do it. Jest's `coverageThreshold` and Vitest's `thresholds` are expressed
 * globally or per glob, and a glob cannot name "whatever this branch changed". So the two inputs are
 * joined here instead: the lcov report each runner already writes, and `git diff`.
 *
 *   changed lines   git diff --unified=0 <base>...HEAD, the added side of every hunk
 *   measured lines  the DA records of the lcov the runner just wrote
 *   the bar         the intersection, as a percentage
 *
 * Which files count is not configured here on purpose. A file is eligible if and only if it appears
 * in the lcov report, which means the answer is whatever the runner instrumented. Restating
 * vitest.config.ts's include list and jest.config.js's collectCoverageFrom in a third place would
 * create two copies to keep in step, and the copy in the script is the one that would drift. It also
 * means specs, generated files and everything else the runners exclude are skipped for free.
 *
 * Run:
 *   node scripts/diff-coverage.mjs --scope backend            after `cd backend && npm run test:cov`
 *   node scripts/diff-coverage.mjs --scope frontend           after `npm run test:cov`
 *   node scripts/diff-coverage.mjs --ratchet                  what the repository floors have earned
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The bar, as a percentage of the changed lines a runner measured.
 *
 * 80 rather than 100: a handler's unreachable default branch and a constructor nobody calls in
 * anger are real, and a bar of 100 is a bar people disable. 80 leaves room for those without
 * leaving room for an untested file.
 */
const BAR = 80;

/**
 * The bar is on the whole diff rather than per file, because a percentage over three changed lines
 * is noise, and noise is what makes a gate get switched off. One exception, which is the case the
 * story exists for: a file with this many changed lines and none of them covered fails on its own,
 * however well the rest of the diff scores.
 */
const UNTESTED_FILE_LINES = 10;

/** How far under a measured number a repository floor sits. See --ratchet at the bottom. */
const RATCHET_SLACK = 2;

const SCOPES = {
  frontend: {
    lcov: "coverage/lcov.info",
    summary: "coverage/coverage-summary.json",
    // Vitest writes SF paths relative to the repository root already.
    prefix: "",
    config: "vitest.config.ts",
    thresholdKey: "thresholds",
    run: "npm run test:cov",
  },
  backend: {
    lcov: "backend/coverage/lcov.info",
    summary: "backend/coverage/coverage-summary.json",
    // Jest's rootDir is backend/src, so its SF paths read "src/..." and mean "backend/src/...".
    prefix: "backend/",
    config: "backend/jest.config.js",
    thresholdKey: "global",
    run: "cd backend && npm run test:cov",
  },
};

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : (args[index + 1] ?? "");
};

const ratchetMode = args.includes("--ratchet");
const scopeName = flag("scope");
const base = flag("base") || process.env.DIFF_COVERAGE_BASE || "origin/main";

const die = (message) => {
  console.error(message);
  process.exit(1);
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

// stderr is captured rather than inherited so that when git fails, the message a reader sees is the
// one below saying what to do about it, not four lines of "ambiguous argument" above it.
const git = (...argv) =>
  execFileSync("git", argv, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

/**
 * The added side of every hunk, per file.
 *
 * `--unified=0` so a hunk carries no context lines, which would otherwise be counted as changed and
 * quietly credit the author for lines they did not write. `--diff-filter=d` drops deletions, since a
 * deleted file has nothing left to cover. `base...HEAD` compares against the merge base rather than
 * the tip of main, so unrelated work that landed on main while this branch was open is not read as
 * part of this diff.
 */
function changedLines(baseRef) {
  let diff;
  try {
    diff = git("diff", "--unified=0", "--diff-filter=d", `${baseRef}...HEAD`);
  } catch (error) {
    die(
      `could not diff against ${baseRef}: ${String(error.message).split("\n")[0]}\n` +
        `In CI, check out with fetch-depth: 0 so the base commit is present. Locally, run ` +
        `git fetch origin main.`,
    );
  }

  const files = new Map();
  let current = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      current = newSideOf(line);
      if (current && !files.has(current)) files.set(current, new Set());
    } else if (current && line.startsWith("@@")) {
      addHunk(files.get(current), line);
    }
  }
  return files;
}

/** "+++ b/src/thing.ts" is the file a hunk lands in. "+++ /dev/null" means it was deleted. */
function newSideOf(header) {
  const target = header.slice(4).trim();
  return target === "/dev/null" ? null : target.replace(/^b\//, "");
}

/** "@@ -12,3 +14,5 @@" means five lines starting at 14 on the new side. A missing count means one. */
function addHunk(lines, header) {
  const hunk = header.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
  if (!hunk) return;
  const start = Number(hunk[1]);
  const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
  for (let n = 0; n < count; n += 1) lines.add(start + n);
}

/** SF / DA / end_of_record, which is all of lcov this needs. Values are hit counts per line. */
function readLcov(file, prefix) {
  const text = readFileSync(file, "utf8");
  const measured = new Map();
  let current = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("SF:")) {
      current = new Map();
      measured.set(prefix + line.slice(3).trim(), current);
    } else if (line.startsWith("DA:") && current) {
      const [number, hits] = line.slice(3).split(",");
      current.set(Number(number), Number(hits));
    } else if (line.startsWith("end_of_record")) {
      current = null;
    }
  }
  return measured;
}

/** 12, 13, 14, 19 reads as 12-14, 19. Line lists get long and a reader is scanning for a region. */
function ranges(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const out = [];
  for (const n of sorted) {
    const last = out.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out.map(([from, to]) => (from === to ? `${from}` : `${from}-${to}`)).join(", ");
}

// ---------------------------------------------------------------------------
// The ratchet
// ---------------------------------------------------------------------------

/*
 * Raising a repository floor is a person's decision, and it should be a two-minute one rather than a
 * guess. This prints what each suite measures now and what its floor would become: the measured
 * number floored to a whole percent, less RATCHET_SLACK, and never below the floor already written
 * down. The slack is why ordinary work does not break main for whoever merges next, which is how a
 * floor gets deleted rather than raised. Never-below is why a bad week cannot lower the bar by
 * accident: a ratchet that turns both ways is a spring.
 */
const METRICS = ["statements", "branches", "functions", "lines"];

/** The four numbers a config has written down now, read out of the file rather than guessed. */
function currentFloors(scope) {
  const text = readFileSync(path.join(REPO_ROOT, scope.config), "utf8");
  const block = text.match(new RegExp(`${scope.thresholdKey}:\\s*\\{([^}]*)\\}`));
  if (!block) return {};
  const floors = {};
  for (const metric of METRICS) {
    const hit = block[1].match(new RegExp(`${metric}:\\s*(\\d+(?:\\.\\d+)?)`));
    if (hit) floors[metric] = Number(hit[1]);
  }
  return floors;
}

function ratchet() {
  let missing = false;
  for (const [name, scope] of Object.entries(SCOPES)) {
    const summaryPath = path.join(REPO_ROOT, scope.summary);
    if (!existsSync(summaryPath)) {
      console.log(`\n${name}: no coverage summary. Run \`${scope.run}\` first.`);
      missing = true;
      continue;
    }
    const totals = JSON.parse(readFileSync(summaryPath, "utf8")).total;
    const floors = currentFloors(scope);
    console.log(`\n${name}, measured by \`${scope.run}\`, floors live in ${scope.config}:`);
    for (const metric of METRICS) {
      const { pct, covered, total } = totals[metric];
      const now = floors[metric];
      const earned = Math.max(0, Math.floor(pct) - RATCHET_SLACK, now ?? 0);
      const verdict = earned === now ? `floor ${now}, stays` : `floor ${now} raise to ${earned}`;
      const share = `(${covered}/${total})`.padEnd(13);
      console.log(`  ${metric.padEnd(11)} ${String(pct).padStart(6)}%  ${share} ${verdict}`);
    }
  }
  console.log(
    `\nEarned means the measured number floored to a whole percent, less ${RATCHET_SLACK}, and` +
      ` never\nbelow the floor already there. Edit the config named above in a pull request, with` +
      ` these\nfigures in the body.`,
  );
  process.exit(missing ? 1 : 0);
}

if (ratchetMode) ratchet();

// ---------------------------------------------------------------------------
// The bar
// ---------------------------------------------------------------------------

const scope = SCOPES[scopeName];
if (!scope) {
  die(`--scope must be one of ${Object.keys(SCOPES).join(", ")}, or pass --ratchet`);
}

const lcovPath = path.join(REPO_ROOT, scope.lcov);
if (!existsSync(lcovPath)) {
  die(
    `no coverage report at ${scope.lcov}. Run \`${scope.run}\` before this check, or it measures ` +
      `nothing and passes, which is worse than failing.`,
  );
}

const measured = readLcov(lcovPath, scope.prefix);
const changed = changedLines(base);

const files = [];
let changedTotal = 0;
let coveredTotal = 0;

for (const [file, lines] of [...changed].sort((a, b) => a[0].localeCompare(b[0]))) {
  const instrumented = measured.get(file);
  if (!instrumented) continue; // Not something this runner measures: a spec, a config, a doc.

  const relevant = [...lines].filter((line) => instrumented.has(line));
  if (!relevant.length) continue; // Touched, but only in blank lines, comments or type positions.

  const uncovered = relevant.filter((line) => instrumented.get(line) === 0);
  changedTotal += relevant.length;
  coveredTotal += relevant.length - uncovered.length;
  files.push({
    file,
    changed: relevant.length,
    uncovered,
    pct: ((relevant.length - uncovered.length) / relevant.length) * 100,
  });
}

const header = `${scopeName} diff coverage, ${base}...HEAD`;

if (!files.length) {
  console.log(`${header}: no measured lines changed. Nothing to hold to a bar.`);
  process.exit(0);
}

const overall = (coveredTotal / changedTotal) * 100;
console.log(
  `${header}\n  ${files.length} file${files.length === 1 ? "" : "s"}, ` +
    `${changedTotal} changed lines measured, ${coveredTotal} covered, ${overall.toFixed(1)}%\n`,
);

for (const entry of files) {
  const mark = entry.uncovered.length === 0 ? "✔" : "•";
  console.log(
    `  ${mark} ${entry.file}  ${entry.pct.toFixed(0)}% ` +
      `(${entry.changed - entry.uncovered.length}/${entry.changed})`,
  );
  if (entry.uncovered.length) console.log(`      uncovered: ${ranges(entry.uncovered)}`);
}

const untested = files.filter(
  (entry) => entry.uncovered.length === entry.changed && entry.changed >= UNTESTED_FILE_LINES,
);
const problems = [];
if (overall < BAR) {
  problems.push(`diff coverage is ${overall.toFixed(1)}%, under the bar of ${BAR}%`);
}
for (const entry of untested) {
  problems.push(`${entry.file} has ${entry.changed} changed lines and no test reaches any of them`);
}

if (!problems.length) {
  console.log(
    `\n${overall.toFixed(1)}% of changed lines are covered, at or over the bar of ${BAR}%.`,
  );
  process.exit(0);
}

console.log(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
for (const problem of problems) console.log(`  ✖ ${problem}`);

/*
 * The way out, in the open. Some diffs genuinely cannot be covered by the suite that measures them:
 * a bootstrap file, a migration script, a branch that only a real provider takes. A gate with no
 * exit is a gate somebody eventually deletes, so the exit exists and its price is saying why, in the
 * pull request, where a reviewer reads it. Same shape as the board's `no-board-update:`.
 */
const excused = (process.env.PR_BODY || "").match(/^[ \t]*diff-coverage-exception:[ \t]*\S.*$/im);
if (excused) {
  console.log(`\nExcused by the pull request body:\n  ${excused[0].trim()}`);
  process.exit(0);
}

console.log(
  `\nWrite the tests the lines above are asking for. If this diff genuinely cannot be covered,` +
    `\nput a line in the pull request description:\n  diff-coverage-exception: <reason>`,
);
process.exit(1);
