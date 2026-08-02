# The handover week

**Goal:** when Friday closes, someone else can pick this codebase up and be productive without you in the room.
**Capacity:** one human reviewing, AI agents implementing.
**Written:** 2026-07-29. Companion to `MVP_OUTSTANDING_BACKLOG.md`.

---

## The constraint nobody plans for

With agents implementing, developer-days stop being the limit. **Your review hours become the limit.** A small
PR costs roughly 30 to 45 minutes to review properly: read the diff, run the validation command, check the
acceptance criteria were actually met rather than approximated. At six usable hours a day that is **12 to 15 PRs
for the week**, and the last two days are worse because you are also packaging.

Every plan that ignores this produces a pile of unreviewed agent branches, which is worse than doing less. The
plan below is sized to 14 PRs and front-loads the ones that matter.

## The principle for this week

**Truth over features.** A handover fails when the next team trusts a document that lies, not when they inherit a
gap. A clearly documented missing feature costs them a day. A checklist that says "done" about something that
isn't costs them a week and their confidence in everything else in the repo.

That is why the highest-value work this week is unglamorous, and why **epic E1 is deliberately not started.** It
is an L story. Half a due diligence lifecycle, merged and unreviewed, is the single worst thing you could hand
over. A precise description of the gap is worth more.

---

## Day 1, truth (3 PRs) — mostly done already

| PR | Story | Notes |
| --- | --- | --- |
| 1 | DOCS-1 checklist reconciliation | Done in this session. Review the Audit corrections table for accuracy against your own knowledge |
| 2 | `HANDOVER.md` + stale-doc banners | Done in this session |
| 3 | ADRs 0001 to 0005 recording D1 to D5 as proposed | Agent task, mechanical, low review cost |

Review cost is low because it is prose. Spend the time you save reading the Audit corrections table critically,
since everything downstream trusts it.

## Day 2, landmines (4 PRs)

Four small stories, each independently reviewable, each removing a thing that would otherwise hurt someone.
All four have full acceptance criteria in the backlog, so agents can work them unattended.

| PR | Story | Why this one |
| --- | --- | --- |
| 4 | **E2-S4** production guard on payment mock mode | A missing key currently records every payout as completed. Highest harm-per-line in the repo |
| 5 | **E5-S2** CORS allow-list | `origin: true` with credentials means any website can make authenticated calls with a visitor's cookie |
| 6 | **E3-S4** public `/verify` page | Every PoA QR ever generated points at a 404. One page closes it |
| 7 | **E7-S6** health and readiness probes | Gives the next team a way to tell a broken deploy from a healthy one |

## Day 3, the exposure (2 PRs)

| PR | Story | Notes |
| --- | --- | --- |
| 8 | Failing probe test for document exposure | **Write the test first, merge it red or skipped with a linked story.** An executable proof of the hole is a better handover artifact than a paragraph, and it converts to the regression test when the fix lands |
| 9 | **E3-S1** authorized document access | Attempt the fix. If it does not land cleanly by end of day, stop and ship PR 8 alone. Do not merge a half-migrated storage path |

This is the one genuinely risky item in the week. The stop rule matters more than the attempt.

## Day 4, make it runnable (3 PRs)

| PR | Story | Notes |
| --- | --- | --- |
| 10 | **E7-S2** coverage thresholds with the baseline measured and recorded | Record today's real number in the PR description. Without a recorded baseline a ratchet has nothing to ratchet from |
| 11 | **E7-S4** demo seed that actually resolves | Fixes QA-015. The next team's first impression is the seeded app, and today it shows stock photography |
| 12 | Ephemeral-database spike for E7-S3 | **Timebox to half a day.** If CI cannot get a throwaway Postgres cleanly, do not force it. Write down exactly what blocked it and what is needed. A documented dead end is a real deliverable |

## Day 5, package and freeze (2 PRs)

| PR | Story | Notes |
| --- | --- | --- |
| 13 | **E7-S5** runbook, environment matrix, secrets checklist | Every variable, whether it is required per environment, and who holds it. This is what the next team asks for on day one |
| 14 | Re-audit and freeze | Re-run the gap claims against HEAD, update statuses on the board, tag a handover commit |

Reserve the last two hours to walk the standalone due diligence flow yourself and confirm `HANDOVER.md` still
describes reality after the week's changes.

---

## Explicitly not doing, and why

Say this out loud in the handover, because silence reads as an oversight rather than a decision.

| Not doing | Why |
| --- | --- |
| **E1**, the DD case lifecycle | L story. Half-built and unreviewed is worse than absent and documented |
| **E2-S1**, seller payout accounts | Blocked on decision D2. Building it before the fund-holding model is settled risks building the wrong thing twice |
| **E5-S5**, session management | L, and it touches every authenticated request. Not a thing to land in a week you are leaving |
| **E8-S1**, NDPR | L, and needs the client's retention policy first |
| **E6-S2/S3**, email channel and templates | Depends on E6-S1, which needs a mail domain the client owns. E6-S1 alone is worth doing only if EXT-3 lands early in the week |

## Working agreement for the agents

Give this to every agent alongside the story.

1. One story, one PR, single purpose. Never combine two stories to save a round trip.
2. **Copy the acceptance criteria verbatim into the PR description and tick them individually.** Untickable
   criteria mean the story was not understood, which is a signal worth having early.
3. No story is done without pasted output from `npm run validate:tsc`, `npm test`, and `cd backend && npm test`.
4. Cite a file and line for every behavioural claim in the PR description, matching the backlog's own standard.
5. If a story turns out bigger than its size, **stop and say so** rather than expanding scope. A flagged
   mis-estimate costs an hour; a sprawling PR costs the reviewer an afternoon.
6. Never run `prisma migrate reset`. The database is shared.
7. **A user-facing change ships behind a flag, off by default.** Declare the key in
   `backend/src/feature-flags/feature-flags.constants.ts`, gate the route with `@RequiresFeature` and
   the control with `<Feature>`, and say in the PR which variable turns it on. CH-1 built that, so the
   old form of this rule, say so in the PR rather than inventing a flag system, has been retired.
   `docs/RUNBOOK.md` §11 is the operator half.
8. **Bring the whole board up to date in the same diff as the work.** Not afterwards, not in a
   follow-up, and not the row on its own. This one is enforced rather than trusted — see below.
9. **Write like a person, not like a model.** No em dashes, full punctuation, no chatbot house style.
   This covers PR titles and descriptions, commit messages, board prose, anything under `docs/`, and
   the notes you write back to whoever asked for the work. Specifics below.
10. **Never name the assistant product that helped write something.** Not in the documents a
    stakeholder reads, not in the backend, not in a comment, a commit message or a workflow file.
    Write how the work was staffed instead. This one is enforced rather than trusted, like rule 8,
    and the section below says what the check covers and what it does not.

### Rule 8, and why it is a gate rather than a habit

The board is the only place a reader can see the whole week at once, which makes it the first thing
that goes stale and the last thing anyone re-reads. It has now been wrong twice: two different
commit hashes in two adjacent header lines, and a day marked complete above three unfinished rows
of its own. A person caught both. That is one person's attention spent on something a check does in
under a second.

**The unit of update is the page, not the row.** One story's status is written down in six places —
the row, the day card, the counter tiles, the header, the review queue and the prose above them —
and this is by design, because a reader arriving at any one of them should learn where the week
stands. The cost of that design is that an author who moves only the row leaves five true-looking
statements behind, each of which reads as current. That is not a smaller update than the rule asks
for; it is a board that now disagrees with itself in five places instead of being out of date in
one.

**What the rule requires of a story PR:**

| Your change | What the board needs |
| --- | --- |
| A new story | Add its row: id, epic, title, what, **Day**, flag, size, depends-on, status. Add it to the day card too, and to the `all N rows accounted for` count in the *Day by day* heading |
| Work that merged | Set the row to `done` **and put the PR number in it**. A done row with no PR is a claim nobody can trace to a diff. Name the same PR on the day-card item |
| Work that slipped | Move the **Day** column to the day it will now land, and fix both day cards — the one that listed it and the one that gets it |
| A parent whose children are still open | Status `part`. Not `done`, which erases the open half; not `planned`, which erases the merged half |
| Scope you discovered | A new row, not a wider one. That is rule 5 written down where the next person will see it |
| A day that closes or opens | Its card's `done` flag, its `count`, the `Day N` tile above it, and the header's "days 1 to N complete, day M open" |
| Any count that moved | `PRs merged` and `Remaining` count PR-shaped rows carrying a day, done and not done — counted over rows rather than whole days so both stay true in the middle of a day, not only when one closes. The *Up next* prose quotes both in sentences: a count that changes makes the sentence around it false, so rewrite the sentence, do not just edit the digit |
| A PR that merged | Take it out of `QUEUE` and put your own in its place. The queue is what the reviewer opens next, so it names exactly one pull request: the newest, which is the one your diff is opening. A queue advertising work that already landed is worse than an empty one |
| Anything at all | The header's commit and its `Updated` date. You verified against a commit — say which one |

**The Day column means the day the work landed, or the day it is now scheduled to land.** It is not
a record of where it was first planned; the day cards carry that history in prose.

**How it is enforced:**

- `npm run validate:board` checks the board against itself: no duplicate ids, no dead dependency
  references, every done row traceable to a PR, day cards agreeing with the Day column, the header
  naming one commit that exists, and — the check that would have caught the failure above — no day
  marked done while a row assigned to it is not.
- It also checks everything the page states twice against the one place it is data, so the table
  above is enforced and not merely advice: day-card PR numbers against the row's, the six tiles
  against the day cards, the header's day claim and `Updated` date, the ADR and gate counts against
  the lists they summarise, the queue against the newest PR on the board, and the two counts the *Up
  next* prose quotes. Rows fix the day cards, day cards fix the tiles, and everything else is checked
  against those — one source, checked outwards. Note that it reads a `done` row as a claim about the
  diff it sits in rather than about `main`: rows are written as merged because the board lands inside
  the pull request it describes, so staleness is judged by a newer PR existing, not by status.
- It refuses a board that has lost its light and dark switch. That control has no row, no count and
  no sentence tying it to anything, so a wide edit can drop it while every other check still passes,
  and it was asked for twice. All four parts are asserted: the script that picks the opening theme
  before the first paint, the button, the handler that flips it, and the line that remembers the
  choice. Move it, restyle it, rename the label, but do not delete it.
- What it deliberately does not check is the prose itself. Narrative is the reviewer's job, and a
  check that fired on rewording would be routed around within a week. The numeric claims in *Up
  next* are verified only where the sentence is still there: reword freely, but do not leave behind
  a figure the data stopped supporting.
- The one place that softness cost something is the effort section, where a paragraph reading
  "68 to 98 developer-days" sat under a tile reading 57 to 87 for two merges before anyone noticed.
  The fix keeps the wording free and pins the figures instead. A number a sentence lifts from the
  effort bars is tagged with the epic it came from, `<b data-epic="Ops">12</b>`, or with
  `data-total="backlog"` for the sum, and the check verifies those against `EPICS`. Rewrite the
  sentence around a tagged figure however you like. What you cannot do is leave the figure behind.
- CI runs the same script on every pull request, and **fails a PR that changes `src/`, `backend/`,
  `scripts/`, `docs/` or the workflows without touching `docs/mvp-board.html`.**
- The escape hatch is a line in the PR description reading `no-board-update: <reason>`. It is
  deliberately visible: a waiver the reviewer reads is a decision, a waiver nobody sees is a hole.

A gate that blocks honest work gets disabled within a week, so if the check is wrong, say so in the
PR and fix `scripts/check-board.mjs`. What it must never become is a step people route around.

### Rule 9, and what "like a person" means here

Everything this repo produces in prose is read by somebody deciding whether to trust it. A reviewer
reading a PR description, a stakeholder reading the board, whoever inherits this in six months
reading a commit message. Writing that reads as machine-generated gets skimmed rather than read, and
the evidence inside it gets skimmed along with it. That is a real cost, because the evidence is the
entire point of rules 2, 3 and 4.

"Write better" is not a rule anyone can follow, so here are the specifics.

- **No em dashes.** Not in prose, not in a heading, not as `&mdash;` in board copy. A comma, a
  colon, a semicolon or a full stop does the same job, and none of them announce who wrote the
  sentence. Em dashes already sitting in files you are not otherwise editing can stay. Do not open a
  PR to sweep them.
- **Full punctuation and complete sentences.** Including in bullet lists, table cells and commit
  message bodies. A fragment saves the writer two seconds and costs every reader a re-read.
- **No stock openers or closers.** "In summary", "It is worth noting that", "Certainly", "I hope
  this helps", "Let me know if you would like me to". Say the thing and stop.
- **No filler structure.** Three items because there are three, not because three sounds complete.
  No bolding every third phrase. No "not just X, but Y" when "Y" was the whole sentence.
- **A claim carries its evidence or it does not go in.** This is rule 4 pointed at prose. "Improves
  performance significantly" is a sentence a model writes. "Cuts the listing query from 40 round
  trips to 3" is a sentence a reviewer can check, and checking it is their job.

Where this does not apply: code comments follow the conventions of the file they sit in, and
generated output is whatever the generator emits.

Unlike rule 8, this one is trusted rather than gated, and deliberately so. A blanket grep for `—` in
a diff would fail honest work on day one, because the board uses a bare em dash as the "no flag"
marker in the flag column of every `STORIES` row. A check that fires on correct data is a check
people learn to ignore, and rule 8's own section explains why that is the worst outcome available.
Catching this one is a review job.

### Rule 10, and why this one is gated where rule 9 is not

This repository is a handover. Every document in it gets read by somebody deciding whether the work
under it can be trusted, and a page that opens by naming the assistant that produced it hands that
reader a different question to answer. They stop weighing the audit and start weighing the tool, and
whichever way they land on the tool, the evidence underneath gets read with a thumb on the scale.
That is the cost rule 9 describes, arriving by a different route.

There is a second reason and it outlives any opinion about the tools. A product name is a fact with
a shelf life. Which assistant was in use in August 2026 tells the team that inherits this in 2027
nothing they can act on, and it will read as dated long before the architecture does. **How the work
was staffed does not go stale.** "One developer running AI agents, with a second developer reviewing
and merging" tells the next reader the volume of pull requests to expect and where the second pair
of eyes was, and both of those are still true whatever the agents were running on. Write that.

**How it is enforced:**

- `npm run validate:prose` runs `scripts/check-prose.mjs`, which greps every tracked file for the
  banned terms and prints file, line and the offending text for each hit. The two package lockfiles
  are excluded because nobody writes prose into them. Binary files are skipped by `git grep -I`.
  Nothing else is out of scope, source and configuration and the workflows included, because a
  product name is no more welcome in a code comment than in a heading.
- CI runs it on every pull request with **no path filter at all**, which is the one thing that
  separates it from the board job. The board check is filtered because it costs runner-minutes. This
  one is a single git call, and a writing rule that applies to some diffs and not others is a rule
  with a gap in the middle of it.
- **What is gated is the literal list in `BANNED`, which today holds one term.** The rule above is
  broader than the list, and that is on purpose: a check that tried to recognise every assistant
  product by name would start guessing, and a check that guesses is one people learn to ignore.
  Adding a term when a new tool shows up is a one-line change to that array, and doing it is
  expected rather than exceptional.
- The script assembles its needles from parts rather than spelling them out, so that it does not
  have to exempt itself from its own check. That looks fussy for one line and it is the difference
  between a gate and a gate with a hole in it.

Where this does not apply: local tooling directories are gitignored and never scanned, so keep
whatever you like in yours. Generated output is whatever the generator emits.

There is a carve-out this rule deliberately does not make, which is history. The *Last Session
Notes* in `docs/BUILD_CHECKLIST.md` record what each session used, and the honest fix there was to
rewrite the entry as the arrangement rather than to grandfather the name. A rule that exempts what
is already written is a rule that never removes anything.

## What good looks like on Friday

The next team can clone the repo, read `HANDOVER.md`, run the app against a seed that resolves, see a passing CI
gate with a recorded coverage floor, open a backlog where every claim cites a line, and find the open decisions
written down as questions rather than discovered as surprises. That is a credible handover, and it is achievable
in five days.

Shipping two more features and leaving the documentation lying is not.
