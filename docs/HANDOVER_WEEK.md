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
7. If the change is user-facing and there is no feature-flag system yet, say so in the PR rather than inventing one.

## What good looks like on Friday

The next team can clone the repo, read `HANDOVER.md`, run the app against a seed that resolves, see a passing CI
gate with a recorded coverage floor, open a backlog where every claim cites a line, and find the open decisions
written down as questions rather than discovered as surprises. That is a credible handover, and it is achievable
in five days.

Shipping two more features and leaving the documentation lying is not.
