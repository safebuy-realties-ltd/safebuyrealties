#!/usr/bin/env node
/**
 * Rule 10 in docs/HANDOVER_WEEK.md: nothing in this repository names the assistant product
 * that helped write it.
 *
 * This repository is a handover. Everything in it gets read by somebody deciding whether the
 * work is trustworthy, and a document that advertises which assistant produced it invites that
 * reader to grade the tool instead of the work. Documentation should say how the work is
 * staffed and what it does. Which product typed it is not a fact the next team needs.
 *
 * Unlike rule 9's em dashes, this one gates cleanly. A literal product name has no honest use
 * anywhere in the tree, so there is no correct data for the check to fire on, and a check that
 * never fires on correct data is one nobody learns to ignore.
 *
 * The needles are assembled from parts rather than spelled out, so this file does not have to
 * exempt itself from its own check. A checker with a hole in it is a checker people route
 * around, which is the failure rule 8's section describes.
 *
 * Run: `npm run validate:prose`. CI runs it on every pull request, unfiltered by path.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Add a term here and it is banned from the whole tree on the next run. Keep `why` short and
 * usable: it is the sentence the author reads when the gate stops them, so it has to say what
 * to write instead rather than restate the rule.
 */
const BANNED = [
  {
    term: ["Claude", "Code"].join(" "),
    why: 'Name the arrangement, not the assistant. Write who did the work and how it was staffed, for example "one developer running AI agents, with a second reviewing".',
  },
];

/**
 * Generated files nobody writes prose into. Everything else is in scope, source and config and
 * the workflows included, because a product name is no more welcome in a comment than in a
 * heading. Binary files are skipped by `git grep -I` rather than by extension.
 */
const EXCLUDED = [
  ":!package-lock.json",
  ":!backend/package-lock.json",
  ":!bun.lockb",
  ":!backend/bun.lock",
];

/** Runs git in the repository root and returns stdout, or null when git found nothing. */
function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    // Exit status 1 from grep and ls-files means no match, which is the passing case here.
    if (err.status === 1) return null;
    throw err;
  }
}

const tracked = (git(["ls-files"]) ?? "").split("\n").filter(Boolean);
const failures = [];

for (const { term, why } of BANNED) {
  // -F literal, -n line numbers, -I skip binaries, -i so a lowercased mention does not slip by.
  const hits = git(["grep", "-F", "-n", "-I", "-i", term, "--", ".", ...EXCLUDED]);
  if (!hits) continue;
  failures.push({ term, why, lines: hits.trimEnd().split("\n") });
}

if (failures.length === 0) {
  console.log(
    `check-prose: ${BANNED.length} banned term${BANNED.length === 1 ? "" : "s"}, 0 hits across ${tracked.length} tracked files.`,
  );
  process.exit(0);
}

for (const { term, why, lines } of failures) {
  console.error(
    `\nBanned in this repository: "${term}"  (${lines.length} hit${lines.length === 1 ? "" : "s"})`,
  );
  console.error(`  ${why}\n`);
  for (const line of lines) {
    const [file, lineNo, ...rest] = line.split(":");
    const text = rest.join(":").trim();
    const shown = text.length > 120 ? `${text.slice(0, 117)}...` : text;
    console.error(`  ${file}:${lineNo}`);
    console.error(`    ${shown}`);
    console.error(
      `::error file=${file},line=${lineNo}::Rule 10: remove the reference to "${term}".`,
    );
  }
}

console.error("\nRule 10 in docs/HANDOVER_WEEK.md has the reasoning and the scope.");
console.error(
  "If a term in scripts/check-prose.mjs is wrong, say so in the pull request and change it there.",
);
console.error("Do not route around the check.\n");
process.exit(1);
