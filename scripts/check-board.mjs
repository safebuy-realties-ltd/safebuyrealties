#!/usr/bin/env node
/**
 * Structural validation for docs/mvp-board.html.
 *
 * The board is hand-maintained HTML with its data in inline arrays, so nothing but a reader has
 * ever checked it. Twice now it has carried a claim that was false in a way a machine would have
 * caught in a second: two different commit hashes in two adjacent header lines, and a "Day 3
 * done" card sitting above three unfinished day-3 rows. Those are the checks below.
 *
 * The unit of update is the page, not the row. A story's status appears in a row, in a day card, in
 * a counter tile, in the header, in the review queue and in the prose above them, and an author who
 * moves the row alone leaves five true-looking statements behind. So everything the page states
 * twice is checked against one source: rows fix the day cards, day cards fix the tiles, and the
 * header and the queue are checked against both.
 *
 * This validates *consistency*, not truth. It cannot know whether a row that says "done" really
 * shipped — that is the reviewer's job. It knows whether the board contradicts itself.
 *
 * Run: `npm run validate:board`. CI runs it on every pull request.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOARD = path.join(REPO_ROOT, "docs", "mvp-board.html");

/**
 * Day 1's three documentation stories were committed directly, before the branch-and-PR rule was
 * being applied to prose. They are the only done rows allowed to carry no PR number; anything
 * else without one is a row nobody can trace back to a diff.
 */
const DIRECT_COMMITS = new Set(["DOCS-1", "DOCS-2", "DOCS-3"]);

const DAY_KEYS = ["D1", "D2", "D3", "D4", "D5"];
const SIZES = new Set(["S", "M", "L"]);

const failures = [];
const notes = [];
const fail = (message) => {
  failures.push(message);
};

/** Board prose carries entities and inline tags. Compare against the text a reader actually sees. */
const text = (html) =>
  html
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&ndash;", "–")
    .replaceAll("&mdash;", "—")
    .replaceAll("&middot;", "·")
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/g, " ")
    .trim();

const source = readFileSync(BOARD, "utf8");

/**
 * Evaluate one of the board's data literals out of the HTML.
 *
 * Deliberately not a parser: the point is to read exactly what the browser reads, so a literal
 * this cannot evaluate is itself a failure the page would have hit too.
 */
function readLiteral(name, close) {
  const match = source.match(new RegExp(`const ${name} = ([\\s\\S]*?)\\n\\${close};`));
  if (!match) {
    fail(`could not find the ${name} literal in docs/mvp-board.html`);
    return null;
  }
  try {
    return new Function(`return ${match[1]}\n${close}`)();
  } catch (error) {
    fail(`${name} is not valid JavaScript: ${error.message}`);
    return null;
  }
}

const STORIES = readLiteral("STORIES", "]");
const DAYS = readLiteral("DAYS", "]");
const STATUS = readLiteral("STATUS", "}");
const QUEUE = readLiteral("QUEUE", "]");
const EPICS = readLiteral("EPICS", "]");

if (!STORIES || !DAYS || !STATUS || !QUEUE || !EPICS) {
  console.error(failures.map((f) => `  ✖ ${f}`).join("\n"));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

// [id, epic, title, what, day, flag, size, deps, status, criticalPath, pr]
const byId = new Map();

/** Done rows with no PR, resolved after the loop — a parent's evidence is its children's PRs. */
const doneWithoutPr = [];

for (const [index, row] of STORIES.entries()) {
  const where = `STORIES[${index}]`;

  if (!Array.isArray(row) || row.length < 10 || row.length > 11) {
    fail(`${where} has ${Array.isArray(row) ? row.length : "no"} fields, expected 10 or 11`);
    continue;
  }

  const [id, , title, what, day, , size, , status, criticalPath, pr] = row;

  if (typeof id !== "string" || id === "") fail(`${where} has no id`);
  if (byId.has(id)) fail(`duplicate id "${id}" at ${where}`);
  else byId.set(id, { row, index });

  if (day !== "" && !DAY_KEYS.includes(day)) {
    fail(`${id} has day "${day}", expected "" or one of ${DAY_KEYS.join(", ")}`);
  }
  if (!SIZES.has(size)) fail(`${id} has size "${size}", expected S, M or L`);
  if (!(status in STATUS)) fail(`${id} has status "${status}", which STATUS does not define`);
  if (typeof criticalPath !== "boolean") fail(`${id} has a non-boolean critical-path flag`);

  // The board renders these with innerHTML, so a raw `<transactionId>` is swallowed as an unknown
  // element and the reader silently loses a word.
  for (const [field, value] of [
    ["title", title],
    ["what", what],
  ]) {
    if (typeof value !== "string") fail(`${id} has a non-string ${field}`);
    else if (/<[A-Za-z/]/.test(value)) fail(`${id} ${field} contains a raw "<" — escape it as &lt;`);
  }

  if (pr !== undefined) {
    if (!Number.isInteger(pr)) fail(`${id} has a non-integer PR number`);
    if (!["done", "review", "lost"].includes(status)) {
      fail(`${id} carries PR ${pr} but its status is "${status}"`);
    }
  } else if (status === "done" && day !== "" && !DIRECT_COMMITS.has(id)) {
    doneWithoutPr.push(id);
  }
}

/**
 * A parent row — one whose id prefixes its sub-stories' ids, like E3-S1 over E3-S1a and E3-S1d-2 —
 * has no diff of its own. It is the `part` status while its children land, and it closes when the
 * last one does; the PR numbers live on the children. Every other done row must name a PR, which is
 * the rule this exception is carved out of. The trade is a stricter one: a parent may only be done
 * when all of its children are, so flipping the parent early now fails instead of passing silently.
 */
const childrenOf = (id) =>
  [...byId.keys()].filter((other) => other.startsWith(id) && /^\D/.test(other.slice(id.length)));

for (const id of doneWithoutPr) {
  const children = childrenOf(id);
  if (!children.length) {
    const day = byId.get(id).row[4];
    fail(`${id} is done in ${day} but names no PR — a done row must be traceable to a diff`);
    continue;
  }
  const openChildren = children.filter((child) => byId.get(child).row[8] !== "done");
  if (openChildren.length) {
    const one = openChildren.length === 1;
    const noun = one ? "sub-story" : "sub-stories";
    fail(`${id} is done, but its ${noun} ${openChildren.join(", ")} ${one ? "is" : "are"} not`);
  }
}

const prOwners = new Map();
for (const [id, { row }] of byId) {
  const pr = row[10];
  if (pr === undefined) continue;
  if (prOwners.has(pr)) fail(`PR ${pr} is claimed by both ${prOwners.get(pr)} and ${id}`);
  else prOwners.set(pr, id);
}

// A dependency naming a story that does not exist is a dead reference. Free-text dependencies
// ("none", "external", "week's PRs") and ADR or EXT references are left alone on purpose.
for (const [id, { row }] of byId) {
  for (const dep of String(row[7]).split(",")) {
    const token = dep.trim();
    if (!/^(E\d+-S\d+|CH-\d+|DOCS-\d+)/.test(token)) continue;
    if (!byId.has(token)) fail(`${id} depends on "${token}", which is not a row on the board`);
  }
}

// ---------------------------------------------------------------------------
// Day cards against the Day column
// ---------------------------------------------------------------------------

/**
 * A `part` row is a parent mid-flight — it is not a PR of its own, so it does not count towards a
 * day's PR count. Neither is that same parent once it closes: E3-S1 went `done` because its last
 * sub-story landed, not because a diff named E3-S1. A parent that does carry its own PR still
 * counts — E5-S2 shipped the CORS allow-list under #97 and E5-S2a is a later, separate row.
 */
const prShapedByDay = new Map(DAY_KEYS.map((key) => [key, []]));
for (const [id, { row }] of byId) {
  if (row[4] === "" || row[8] === "part") continue;
  if (row[10] === undefined && childrenOf(id).length) continue;
  prShapedByDay.get(row[4])?.push(id);
}

if (DAYS.length !== DAY_KEYS.length) {
  fail(`DAYS has ${DAYS.length} cards, expected ${DAY_KEYS.length}`);
}

for (const [index, card] of DAYS.entries()) {
  const key = DAY_KEYS[index];
  if (!key) break;
  const expectedName = `Day ${index + 1}`;
  if (card.n !== expectedName) fail(`DAYS[${index}] is named "${card.n}", expected "${expectedName}"`);

  const listed = [];
  for (const item of card.items) {
    // Items lead with the story id. Anything else — a carry-over or capacity note — is prose and
    // is deliberately not checked against the Day column.
    const match = String(item).match(/^<b>([^<]+)<\/b>/);
    if (!match) continue;
    const id = match[1];
    listed.push(id);
    if (!byId.has(id)) {
      fail(`${expectedName} lists "${id}", which is not a row on the board`);
      continue;
    }
    if (byId.get(id).row[4] !== key) {
      fail(`${expectedName} lists ${id}, but its Day column says "${byId.get(id).row[4] || "deferred"}"`);
    }

    // Day-card items name the PR in prose — "E3-S4 /verify page · PR 98 merged" — beside a row that
    // names it as data. Two places, one fact, and only the row is under any other check.
    const claimed = String(item).match(/\bPR (\d+)\b/);
    if (!claimed) continue;
    const rowPr = byId.get(id).row[10];
    if (rowPr === undefined) {
      fail(`${expectedName} says ${id} merged as PR ${claimed[1]}, but its row carries no PR number`);
    } else if (Number(claimed[1]) !== rowPr) {
      fail(`${expectedName} says ${id} is PR ${claimed[1]} but its row says PR ${rowPr}`);
    }
  }

  const rows = prShapedByDay.get(key) ?? [];
  if (card.count !== rows.length) {
    fail(`${expectedName} claims ${card.count} PRs but ${rows.length} rows carry day ${key}: ${rows.join(", ")}`);
  }
  if (listed.length !== rows.length) {
    const missing = rows.filter((id) => !listed.includes(id));
    fail(`${expectedName} lists ${listed.length} stories but ${rows.length} rows carry day ${key}${missing.length ? ` — missing ${missing.join(", ")}` : ""}`);
  }

  // The failure that started this script: a day marked done above rows that are not.
  const unfinished = rows.filter((id) => byId.get(id).row[8] !== "done");
  const parts = [...byId]
    .filter(([, { row }]) => row[4] === key && row[8] === "part")
    .map(([id]) => id);
  if (card.done && (unfinished.length || parts.length)) {
    fail(
      `${expectedName} is marked done, but ${[...unfinished, ...parts].join(", ")} ${
        unfinished.length + parts.length === 1 ? "is" : "are"
      } not`,
    );
  }
  if (!card.done && !unfinished.length && !parts.length) {
    fail(`${expectedName} has no unfinished rows, so it should be marked done`);
  }
}

// ---------------------------------------------------------------------------
// Prose that quotes the data
// ---------------------------------------------------------------------------

const rowNote = source.match(/all (\d+) rows accounted for/);
if (!rowNote) fail(`the "all N rows accounted for" note is missing from the Day by day heading`);
else if (Number(rowNote[1]) !== STORIES.length) {
  fail(`the heading says "all ${rowNote[1]} rows accounted for" but STORIES has ${STORIES.length}`);
}

const header = source.match(/<header[\s\S]*?<\/header>/);
if (!header) {
  fail("could not find the page header");
} else {
  const shas = [...header[0].matchAll(/\b[0-9a-f]{7,40}\b/g)].map((m) => m[0]);
  if (!shas.length) {
    fail("the header names no commit — it should say which commit of main it was verified against");
  } else if (new Set(shas).size > 1) {
    fail(`the header names ${new Set(shas).size} different commits: ${[...new Set(shas)].join(", ")}`);
  } else {
    verifyCommitExists(shas[0]);
  }

  const headerText = text(header[0]);
  if (!/\bUpdated \d{4}-\d{2}-\d{2}\b/.test(headerText)) {
    fail(`the header carries no "Updated YYYY-MM-DD" — an undated board reads as current forever`);
  }

  // How much of the week is closed, asserted in prose directly above the day cards that decide it.
  let complete = 0;
  while (complete < DAYS.length && DAYS[complete].done) complete += 1;
  const claim = headerText.match(/days 1 to (\d+) complete, day (\d+) open/);
  if (claim) {
    if (Number(claim[1]) !== complete) {
      fail(`the header says days 1 to ${claim[1]} are complete, but ${complete} day cards from day 1 are marked done`);
    }
    if (Number(claim[2]) !== complete + 1) {
      fail(`the header says day ${claim[2]} is open, but the first day card not marked done is day ${complete + 1}`);
    }
  } else if (complete !== DAYS.length || !/every day complete/.test(headerText)) {
    fail(
      `the header makes no day claim this check can verify — write "days 1 to N complete, day M open", or "every day complete" once the week closes`,
    );
  }
}

/** Skipped on a shallow clone, where an older commit legitimately is not present. */
function verifyCommitExists(sha) {
  const git = (args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  try {
    if (git(["rev-parse", "--is-shallow-repository"]) === "true") {
      notes.push(`shallow clone, not checking that main @ ${sha} exists`);
      return;
    }
    git(["cat-file", "-e", `${sha}^{commit}`]);
  } catch {
    fail(`the header says main @ ${sha}, which is not a commit in this repository`);
  }
}

/**
 * The tiles are the day cards restated as six numbers at the top of the page, which makes them the
 * first thing a reader trusts and the last thing an author edits. Nothing but attention has ever
 * moved them. The day cards are already checked against the rows, so checking the tiles against the
 * day cards chains every count on the page back to a single source.
 */
const tiles = new Map();
for (const match of source.matchAll(
  /<div class="tile"><div class="label">([\s\S]*?)<\/div><div class="value">([\s\S]*?)<\/div><div class="foot">([\s\S]*?)<\/div>/g,
)) {
  tiles.set(text(match[1]), { value: text(match[2]), foot: text(match[3]) });
}
if (!tiles.size) fail("no tiles found — the counters at the top of the page are missing or restructured");

/** Returns the tile so callers can go on to check its footnote, or null when it is not there. */
function checkTile(label, expected, describe) {
  const found = tiles.get(label);
  if (!found) {
    fail(`there is no "${label}" tile — the counters no longer match what this check knows to verify`);
    return null;
  }
  if (found.value !== String(expected)) {
    fail(`the "${label}" tile reads ${found.value}, but ${describe} is ${expected}`);
  }
  return found;
}

// Counted over rows rather than whole days, so both stay true in the middle of a day and not only
// at the boundary where one closes: the first row of an open day going done moves "PRs merged".
const prShaped = [...prShapedByDay.values()].flat();
const mergedPrs = prShaped.filter((id) => byId.get(id).row[8] === "done").length;
const remainingPrs = prShaped.length - mergedPrs;
checkTile("PRs merged", mergedPrs, "the number of PR-shaped rows marked done");
checkTile("Remaining", remainingPrs, "the number of PR-shaped rows carrying a day and not done");

// A tile named for a day — the one that moves every time a day closes.
for (const [label, { value, foot }] of tiles) {
  const named = label.match(/^Day (\d+)$/);
  if (!named) continue;
  const card = DAYS[Number(named[1]) - 1];
  if (!card) {
    fail(`the "${label}" tile names a day with no card`);
    continue;
  }
  const expected = card.done ? "Done" : "Open";
  if (value !== expected) fail(`the "${label}" tile reads "${value}" but its day card is not marked ${expected}`);
  const progress = foot.match(/^(\d+) of (\d+)\b/);
  if (!progress) {
    fail(`the "${label}" tile footnote should open with the day's progress, as "5 of 5 in"`);
    continue;
  }
  if (Number(progress[2]) !== card.count) {
    fail(`the "${label}" tile footnote says "of ${progress[2]}" but the day card counts ${card.count}`);
  }
  if (card.done && Number(progress[1]) !== card.count) {
    fail(`the "${label}" tile says ${progress[1]} of ${progress[2]} in, but the day is done, so it is ${card.count}`);
  }
}

const adrs = [...source.matchAll(/<li><b>ADR-(\d{4})/g)].map((match) => match[1]);
const decisions = checkTile("Open decisions", adrs.length, "the number of ADRs listed under Open decisions");
if (decisions && adrs.length) {
  const range = decisions.foot.match(/ADRs (\d{4})[–-](\d{4})/);
  if (!range) fail(`the "Open decisions" tile footnote should name the range, as "now ADRs 0001–0005"`);
  else if (range[1] !== adrs[0] || range[2] !== adrs.at(-1)) {
    fail(`the "Open decisions" tile footnote says ADRs ${range[1]}–${range[2]} but the list runs ${adrs[0]}–${adrs.at(-1)}`);
  }
}

const gates = [...source.matchAll(/<li><b>(G\d+)<\/b>([\s\S]*?)<\/li>/g)];
const externalGates = gates.filter((gate) => /\bexternal\b/.test(text(gate[2]))).map((gate) => gate[1]);
const gateTile = checkTile("Go-live gates", gates.length, "the number of gates listed");
if (gateTile) {
  const blocked = gateTile.foot.match(/^(\d+)\b/);
  if (!blocked) fail(`the "Go-live gates" tile footnote should open with how many wait on external input`);
  else if (Number(blocked[1]) !== externalGates.length) {
    fail(
      `the "Go-live gates" tile footnote says ${blocked[1]} wait on external input, but ${externalGates.length} gates are marked external: ${externalGates.join(", ")}`,
    );
  }
}

// Same shape as the two above: a tile summarising a list that lives further down the page. The
// effort bars are the data, the "Full backlog" tile is the restatement, so the tile's ceiling has to
// be their sum. Only the ceiling is derivable here — the floor is a judgement recorded in the
// backlog's section 1.3, which this page does not carry per epic, so it is checked for being a
// smaller number and nothing more.
const backlogDays = EPICS.reduce((total, epic) => total + epic.days, 0);
const backlogTile = tiles.get("Full backlog");
if (!backlogTile) {
  fail(`there is no "Full backlog" tile — the effort bars below it summarise nothing`);
} else {
  const span = backlogTile.value.match(/^(\d+)–(\d+)$/);
  const bars = EPICS.map((epic) => `${epic.key} ${epic.days}`).join(", ");
  if (!span) {
    fail(`the "Full backlog" tile reads "${backlogTile.value}", expected a range of days like "67–97"`);
  } else if (Number(span[2]) !== backlogDays) {
    fail(`the "Full backlog" tile's ceiling is ${span[2]} days but the effort bars sum to ${backlogDays}: ${bars}`);
  } else if (Number(span[1]) >= backlogDays) {
    fail(`the "Full backlog" tile reads ${span[1]}–${span[2]}, but a range's floor is below its ceiling`);
  }
}

/**
 * The narrative under "Up next" quotes the same counts in prose. Rewriting that prose is normal work
 * and must not fail CI, so these are verified only where the sentence is present — the pattern is a
 * contract, not a requirement. Reword freely; do not leave behind a number the data stopped
 * supporting, which is the whole failure mode this file exists for.
 */
const narrated = source.match(/(\d+) have merged/);
if (narrated && Number(narrated[1]) !== mergedPrs) {
  fail(`the "Up next" prose says ${narrated[1]} have merged, but ${mergedPrs} PR-shaped rows are marked done`);
}
const holds = source.match(/Day (\d+) holds all (\d+) remaining/);
if (holds && Number(holds[2]) !== remainingPrs) {
  fail(
    `the "Up next" prose says day ${holds[1]} holds ${holds[2]} remaining, but ${remainingPrs} PR-shaped rows carry a day and are not done`,
  );
}

/**
 * The queue is what the reviewer opens next, and every row on this board is written as though its
 * pull request had already merged — that is the convention, since the board lands inside the diff it
 * describes. So a done row is not evidence a queue entry is stale. What makes it stale is a newer PR
 * existing: the highest number on the board is the one being opened right now, and it is the only one
 * a reviewer has left to open. Anything below it merged, and a queue advertising landed work is worse
 * than an empty one — the queue led with #114 for a whole story after it merged.
 */
const openPr = Math.max(...prOwners.keys());
for (const [index, entry] of QUEUE.entries()) {
  for (const field of ["t", "why", "look"]) {
    if (typeof entry[field] !== "string" || entry[field] === "") {
      fail(`QUEUE[${index}] has no ${field}`);
    }
  }
  if (entry.pr === null) continue;
  if (!Number.isInteger(entry.pr)) {
    fail(`QUEUE[${index}] has a malformed PR`);
    continue;
  }
  if (!prOwners.has(entry.pr)) {
    fail(`QUEUE[${index}] points at PR ${entry.pr}, which no row on the board carries`);
  } else if (entry.pr !== openPr) {
    fail(
      `QUEUE[${index}] still asks for a review of PR ${entry.pr}, but PR ${openPr} is newer, so ${entry.pr} has merged — a merged pull request comes out of the queue in the same diff that adds the next one`,
    );
  }
}

// ---------------------------------------------------------------------------

const done = [...byId].filter(([, { row }]) => row[8] === "done").length;
const open = [...byId].filter(([, { row }]) => row[4] !== "" && row[8] !== "done").length;

console.log(
  `docs/mvp-board.html: ${STORIES.length} rows, ${done} done, ${open} open in-week, ` +
    `${prOwners.size} PRs, days ${DAYS.map((d) => d.count).join("/")}`,
);
for (const note of notes) console.log(`  · ${note}`);

if (failures.length) {
  console.error(`\n${failures.length} problem${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) console.error(`  ✖ ${failure}`);
  console.error("\nThe board contradicts itself. Fix docs/mvp-board.html, not this check.");
  process.exit(1);
}

console.log("board is internally consistent");
