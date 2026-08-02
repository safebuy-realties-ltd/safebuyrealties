# SafeBuyRealties, outstanding MVP backlog

**Prepared:** 2026-07-29 · **Codebase reviewed:** `main` @ `fc05e1e` (2026-07-24) · **Paradigm applied:** derived from the reference project (§0)

**Reconciled:** 2026-08-02 by story **DOCS-4** against `main` @ `84f619c`, covering the handover week's pull requests #97 to #132. Statuses, the E3-S1 split record, and the effort remaining in section 1.3 are as of that commit. An earlier reconciliation on 2026-07-31 covered #97 to #115 against `21e981a`.

**What is frozen and what is current.** The gap evidence quoted in section 4, one story at a time, is deliberately left at `fc05e1e`: it is the record of what was found, and a finding rewritten after its own fix stops being checkable. Two things are exempt and are kept current instead, because a reader uses them to decide what to do today rather than to check what was true in July: the quality gate in **section 0.3**, which is the bar a pull request has to clear tonight, and the document inventory in **section 2.3**, which is the list of files that are safe to believe.

Two audiences, one document. Section 1 to 3 are for stakeholders (what is done, what is left, what it costs, what the risk is). Section 4 onward is the developer backlog: one story, one PR, testable acceptance criteria, cited evidence for every claimed gap.

Every "not built" claim below was verified by reading the code, not by reading `docs/BUILD_CHECKLIST.md`. File and line references are given so any claim can be checked in under a minute.

---

## 0. The paradigm, derived from the reference project

The stakeholder asked for the software paradigm used on an earlier and more mature codebase, and asked for it to be applied here. That codebase is called **the reference project** throughout this document. It is not part of this repository, nothing here depends on it, and it is named this way on purpose so that a reader outside the company can follow the argument without needing access to it. The paradigm is not one thing, it is a stack of four layers. Each layer is summarised here and then applied to this backlog.

### 0.1 Architectural paradigm

| Dimension | The reference project | SafeBuyRealties today |
| --- | --- | --- |
| Repo shape | pnpm + Turborepo monorepo: `apps/{api,web,mobile,docs-site}`, `services/voice-ai`, `packages/{shared,api-client,ui-tokens,config}` | Two-package repo: frontend at root, `backend/` beside it, no shared contract package |
| Style | Modular monolith, domain modules, ports and adapters, SOLID enforced by review | Modular monolith, NestJS domain modules, same instinct, less formality |
| Polyglot | TypeScript NestJS + Python FastAPI, Rust adoption behind explicit triggers (ADR-0006) | TypeScript only |
| Eventing | Transactional outbox to BullMQ, Redpanda later (ADR-0002) | Direct in-process calls, some fire-and-forget `void` promises |
| Contracts | One Zod schema shared client and server, JSON Schema exported for the Python service | DTOs on the server, hand-written mirror types in `src/hooks/*`, drift is possible |
| Tenancy | `firmId` on every table, fail-closed Prisma extension, tenant isolation is unflagged because an invariant has no off switch | Ownership checks written per service, no central enforcement layer |
| Delivery | Every user-facing change behind a named feature flag with a kill switch (ADR/rules §13) | Flags and a kill switch since CH-1: a registry in the API, `@RequiresFeature` on the server, `<Feature>` in the browser, `RUNBOOK.md` §11 |

The relevant transfer is not "become a monorepo". It is the three habits that make the reference project's delivery predictable: a shared contract, a fail-closed authorization layer rather than per-service checks, and a flag on every risky change.

### 0.2 Delivery paradigm

- One story equals one small PR, target under about 400 changed lines, behind a feature flag, squash merged with a conventional-commit title.
- Agent loop: product owner writes story plus acceptance criteria, architect designs and writes an ADR when there is a real decision, developer implements a thin vertical slice with tests, reviewer and security architect review against `rules.md`, writer updates docs.
- Every story is logged on a PR tracker board with a status emoji: 📋 planned, 🔨 in progress, 👀 in review, ✅ merged, ⛔ blocked, 🚫 superseded.
- Sizes: S is about a day, M is two to four days, L is about a week.
- The critical path is marked explicitly, and no story off it may move the launch date.
- Work that is not code (legal sign-off, vendor accounts, secrets, content) is tracked separately as external inputs with owners and due dates, and go-live gates are numbered.

### 0.3 Quality paradigm (the definition of done)

The reference project's `rules.md` §1 gate, in short: no unhandled 5xx and correct 4xx mapping, metrics plus traces plus structured logs on every endpoint with a correlation id and never PII in logs, 100 percent line and branch coverage on new code plus mutation testing, zero Sonar issues and zero duplicated lines on new code, zero warnings from every tool, root-cause fixes with a regression test rather than suppressions, and docs updated in the same PR that changed the behaviour.

SafeBuyRealties gates on TypeScript compile, ESLint with zero warnings, unit tests on both sides, a repository coverage floor, a diff coverage bar on the lines a branch changed, the end-to-end journeys, and the board check. The floors are `coverageThreshold` at `backend/jest.config.js:40`, 69 statements, 49 branches, 51 functions and 70 lines, and `thresholds` at `vitest.config.ts:47`, 4, 3, 3 and 4, which is what the frontend has earned so far. The diff bar is `scripts/diff-coverage.mjs`, 80 percent of the changed lines, run inside both test jobs at `.github/workflows/ci.yml:124` and `:162`. The end-to-end scripts in `scripts/` do run in CI, as `node scripts/e2e-ci.mjs --kind api` at `:214` and `--kind browser` at `:288`. What is still missing against the reference bar is mutation testing and a static analysis gate.

**This paragraph is deliberately kept current, unlike the rest of the gap evidence in this document.** At `fc05e1e`, when the backlog was written, the gate was compile, lint and unit tests and nothing else: `backend/jest.config.js` set `collectCoverageFrom` and no `coverageThreshold`, and CI never ran the end-to-end scripts. E7-S2 put the floors in, E7-S2b added the diff bar, and E7-S3 wired the journeys into CI in PR #132. The reason this one is refreshed rather than frozen is that a developer reads it to find out what their PR has to clear tonight, not to find out what was true in July.

Adopting the full reference bar mid-project would have stalled delivery. What this backlog proposed instead, and what is now in force, is a **ratchet**: apply the strict bar to new and touched code only, and raise the floor over time. That mirrors the reference project's own ADR-0013, which replaced an absolute gate with a delta gate plus a tracked baseline carrying a remediation SLA. Here it is ADR-0005, and `npm run coverage:ratchet` is the tool that moves the floor.

### 0.4 Documentation paradigm

Markdown is the source of truth. ADRs record real decisions. A progress log carries status, a decisions log, open questions, epics, and a dated changelog. A PR tracker is the board. Docs are living, and a drift check gates the build. Prose style is enforced: no em dashes, sentence-case headings, no AI-writing tells.

This document follows that style deliberately, so the format is itself the worked example.

---

## 1. Stakeholder summary

### 1.1 Where the build actually stands

The platform is substantially further along than the analysis pack in `docs/analysis/` (dated 2026-05-23) describes. That pack found three crashing screens and no trust layer. Both findings are now out of date: the crashes were fixed in Step 1, and the trust layer largely exists.

Verified as built and wired end to end:

- Six-role identity with separate login portals and a unified admin portal with named admin roles and a privilege catalog.
- Listing lifecycle across ten statuses, spec fields, media, server-side search filters, saved properties, per-listing analytics.
- Verification workflow: staff assign professionals, professionals submit reports with risk flags, staff accept or request revision, activity log.
- Service catalog with items, bundles, and VAT calculated from platform config.
- Due diligence purchase wizard, seven steps, resumable from session storage.
- Power of Attorney execution: PDF generation, SHA-256 document hash, QR code, immutable record, lookup by hash.
- Escrow ledger with hold, release conditions, release, refund, and payout records.
- Standalone due diligence, the strongest flow in the product: guest or authenticated request, professional assignment, per-assignment reports, staff verdict, completion, receipt email.
- KYC records with buyer submission and a staff review queue.
- In-app notifications with a bell, triggers across listings, verification, tasks, and payments.
- Inspection scheduling, platform configuration, audit logging, human-readable SBR IDs, maintenance mode.

That is a real product. The remaining work is narrower than the checklist history suggests, but it is not cosmetic.

### 1.2 The three things that block a real launch

**One. The on-platform buyer journey does not finish.** The due diligence purchase wizard creates an order and takes payment, then the case has nowhere to go. `DueDiligenceService` contains exactly one method, `create()`. There is no staff queue, no professional assignment, no report, and no completion for orders raised against a platform listing. Because nothing ever sets the transaction to `DD_COMPLETE`, the buyer's own screen never offers the property purchase step, so escrow is never funded and the seller is never paid. The complete case lifecycle exists, but only on the standalone path, where the property is off-platform. In practice the product today sells due diligence well and cannot yet sell a house.

**Two. The money cannot safely move.** Payouts resolve the destination bank account from two environment variables that default to Paystack's test account, so every seller payout would go to the same account regardless of who sold the property. Refunds change a database status and never call the gateway, so a refunded buyer is not actually repaid. The payment webhook has no replay protection, so a duplicated gateway callback re-fires notifications and escrow holds. If the Paystack key is absent in production, payouts are silently recorded as completed.

> **Partly closed, 2026-07-30.** The last sentence no longer holds: E2-S4 (#99) makes the application refuse to start in production without a live key, so mock mode cannot be reached there by omission. The first three sentences stand, and they are E2-S1, E2-S3 and E2-S2. This blocker is narrower than it was and is not closed.

**Three. Private documents are publicly readable.** Uploaded files are served by an unauthenticated static route. Anyone who learns or guesses a storage key can fetch a title deed, a government ID, or a KYC selfie without logging in. On the current Vercel deployment those files also land in ephemeral serverless storage, so in production uploads disappear between requests. For a platform whose entire proposition is document trust, sold to clients who were previously defrauded, this is the finding that most needs to close before any real user is invited.

> **The first half is closed, 2026-07-30.** There is no unauthenticated static route any more. E3-S1 ran to six sub-stories (#103, #104, #106, #108, #111, #112) and the last of them deleted the `/uploads` mount rather than guarding it, so every document family now resolves through `GET /api/v1/documents/file`, which authorizes per `Document` row. The probes in `uploads-exposure.spec.ts` fail if that is reverted. **The second half is open and unchanged:** uploads still land in ephemeral serverless storage on Vercel, which is E3-S2, and it is still on the critical path. A platform that authorizes documents correctly and then loses them is not a platform that keeps documents.

### 1.3 What it takes

**Estimate** is the figure struck before the handover week. **Remaining** is that same figure with the merged stories subtracted at their own sizes from the section 0.2 key, S a day, M two to four, L about a week. The two columns are therefore comparable: nothing here is a re-estimate of work that has not been touched.

| Milestone | Outcome | Stories | Estimate | Merged since | Remaining |
| --- | --- | --- | --- | --- | --- |
| **M1 Close the loop** | A buyer can complete a purchase on-platform, end to end | E1 (4) | 11 to 14 days | none | 4 stories, 11 to 14 days |
| **M2 Money integrity** | Real sellers get paid, real refunds are repaid, no double processing | E2 (5) | 12 to 15 days | E2-S4, E2-S2 | 3 stories, 9 to 11 days |
| **M3 Document trust** | Private documents stay private and survive deployment | E3 (4) | 7 to 10 days | E3-S1, E3-S4 | 2 stories, 4 to 7 days |
| **M4 Access correctness** | Privileges are enforced by the API, not only by the menu | E4 (3) | 6 to 9 days | E4-S1, E4-S3 | 1 story, 2 to 3 days |
| **M5 Account security** | Rate limits, real sessions, password reset, verified email | E5 (5) | 11 to 15 days | E5-S2, and E5-S2a on top of it; E5-S6 found and merged; E5-S1; E5-S5, shipped with its flag off | 2 stories, 3 to 6 days |
| **M6 Communications** | Email actually leaves the building | E6 (3) | 5 to 7 days | none | 3 stories, 5 to 7 days |
| **M7 Operability** | Failures are visible, regressions are caught before merge | E7 (6) | 10 to 14 days | E7-S2, E7-S6, E7-S5, E7-S1, E7-S3; E7-S2b and E7-S6b found, both merged | 1 story, 2 to 4 days |
| **M8 Go-live compliance** | NDPR, legal review, security review, public web surface | E8 (4) | 8 to 12 days plus external lead time | E8-S4 | 3 stories, 5 to 9 days plus external lead time |

It was 34 milestone stories plus two chores (DOCS-1 and CH-1, about 4 days), 36 in all, roughly 72 to 100 developer-days. Eighteen milestone stories and both chores have merged, and three more stories were discovered inside them (E7-S2b inside E7-S2, E5-S6 and E7-S6b inside E7-S5). DOCS-4 is a fourth chore the week added to itself, it is the diff you are reading, and with it in there is no chore left, so **19 milestone stories, roughly 41 to 61 developer-days remain.** Each merged story is subtracted at its published size rather than re-estimated, which is the same arithmetic `docs/mvp-board.html` shows on its Full backlog tile. One developer lands what is left in about 6 to 12 calendar weeks. Two developers working the split in section 6 land it in about 4 to 7 weeks, because M1 and M3 parallelise cleanly and M2 depends on M1 only at the final story. One developer running many agents in parallel, with a second reviewing, lands it a good deal faster than either: the board has the evidence from the handover week.

**The floor above used to be 32, and DOCS-4 has settled it at 41.** Worth recording how it drifted, because the mechanism matters more than the ten days. The **Remaining** column subtracts each merged story from that milestone's own range, and its ceilings have always agreed exactly with the per-epic bars on `docs/mvp-board.html`, because a check on the board derives the tile's ceiling from those bars and fails the build when the two disagree. The floor had no such check. It was kept by hand as a single running subtraction against the pre-week 72, so every merge asked somebody to remember a number rather than to add up a column, and by this week it sat ten days below what the eight milestone rows came to, counting the chore day that was still open on both sides of the comparison. Nobody made an error; nothing was ever going to catch one. The rows are the source, with this chore merged they add up to 41, and that is now the figure in both places. Each effort bar on the board carries a floor beside its ceiling, the Full backlog tile sums both ends from those bars, and `npm run validate:board` fails if either drifts again. Plan against the ceiling, as before. The difference is that the floor is now checkable rather than remembered.

**A week of merging bought four days off the floor and two off the ceiling, and found three stories doing it.** That is the shape of the week rather than a mis-estimate. What shipped was landmine work: of the seven milestone stories, six were S, and the one M turned into six sub-stories. M7 went from 10-to-14 up to 10-to-16 because measuring the coverage floor found the half of the criterion a floor cannot express, which is now E7-S2b. M5 went up by a day because writing the environment matrix found the one credential in this application that does not fail closed, which is now E5-S6. An audit week that reveals work is an audit week doing its job, and an estimate that moves when it does is the estimate doing the same.

**The week discovered four stories — E5-S2a, E7-S2b, E5-S6 and E7-S6b — and half of them came out of a documentation story that shipped no code.** Worth noticing before the next team decides documentation is the part to skip. Nothing was found by reading a story's title; it was found by reading the code the title described and writing down what it actually did.

**Demo-safe subset.** If the near-term need is a credible client demo rather than a public launch, M1 plus what is left of M3 is enough, roughly 15 to 21 days, down from 22 to 28 because E2-S4, E2-S2 and the document authorization half of M3 have all landed. That subset used to name E2-S2 as well; it merged in wave 1 and now costs nothing, and DOCS-4 corrected the total here at the same time as the floor above, since both were being carried by hand. That produces a complete buyer journey with private documents and no way to accidentally show a fake payout as real. It is not enough to invite real users onto real naira.

### 1.4 Decisions needed before the work starts

These are product and commercial decisions. Engineering can proceed on M3 without them, and cannot finish M1 or M2 without them.

| # | Decision | Why it blocks | Recommendation |
| --- | --- | --- | --- |
| D1 | Is the on-platform property purchase in the MVP, or is standalone due diligence the MVP? | Two due diligence paths exist and only one is complete. Answering "standalone only" removes most of E1 and E2 and cuts about 20 days | Confirm on-platform is in scope, since escrow and PoA only pay off there. If it is not, retire the wizard rather than leaving it half-wired |
| D2 | Escrow money model and the settlement account | Whether SafeBuyRealties holds client funds changes the CBN and AML posture, and changes E2-S1 from a bank-details form into a regulated flow | Legal and compliance review before E2-S1 starts |
| D3 | KYC: manual review or a provider such as Smile ID or VerifyMe | Manual is built. A provider changes E4-S2 and adds vendor lead time | Ship manual for MVP, keep the provider seam |
| D4 | Object storage provider and region | Blocks E3-S2, which is on the critical path | S3-compatible, decide region for NDPR data residency |
| D5 | Adopt the reference project's quality bar as a ratchet on new code | Sets the definition of done for every story below | Yes, ratchet only, per section 0.3 |

---

## 2. Verified current state

### 2.1 What the audit covered

Prisma schema (719 lines, 30 models, 10 enums), 30 NestJS modules and every controller route, 61 frontend routes, 29 data hooks, 24 backend spec files, 7 frontend test files, the CI workflow, the environment templates, and the six status documents in `docs/`.

### 2.2 Endpoint inventory, by module

Auth, users, listings, documents, verification, tasks, transactions, payments and webhooks, platform config, professionals, service catalog, due diligence orders, PoA, escrow, KYC, notifications, inspections, guest checkout, standalone DD, admin analytics, admin roles, permissions, DD checklist CMS, health. 104 route handlers across 26 controller classes.

### 2.3 Where the documentation disagrees with the code

| Document | Status | Note |
| --- | --- | --- |
| `docs/BUILD_CHECKLIST.md` | ✅ Corrected, DOCS-1 · re-checked, DOCS-4 | Every item read `[x]`, including "API, staff/client DD case lifecycle", which is true for standalone DD and false for listing-based DD. The file now opens with an accuracy notice and an *Audit corrections* table of seven overstatements, each naming the story that closes it. The corrections live in the table and not in a marker on the item, so all 59 items are still `[x]` and there is no `[!]` in the file. DOCS-4 also removed the instruction to start from the first unchecked box, because there is not one |
| `docs/analysis/03_CURRENT_STATE_AUDIT.md` | ✅ Bannered, DOCS-2 · stale, 2026-05-23 | Its three crashing screens were fixed in Step 1, its missing trust layer now exists |
| `docs/TECH_AUDIT.md` | ✅ Bannered, DOCS-2 · stale, 2026-05-02 | Predates cookie auth, transactions, escrow, and object storage |
| `docs/VALIDATION_REPORT.md` | ✅ Bannered, DOCS-2 · stale, 2026-05-25 | Snapshot of a production deploy two months old |
| `docs/QA_FINDINGS.md` | ✅ Bannered, DOCS-2 · mostly closed | QA-015 (seeded documents have no files on disk) and QA-016 (Paystack not validated end to end locally) remain open. QA-015 is E7-S4, which is the first story recommended for the cut |
| `docs/analysis/04_GAP_ANALYSIS.md` | ✅ Bannered, DOCS-2 · partly stale, 2026-05-23 | Most Core MVP gaps, G13 to G41, are closed. The gap categories and the dependency reasoning were reused here; the per-gap statuses were not |
| `docs/analysis/05_STRATEGIC_RECOMMENDATIONS.md` | ✅ Bannered, DOCS-2 · still the right frame | Its Core MVP and Launch-Ready buckets map onto E1 to E4 and E5 to E8 below. Statuses inside it are stale, the bucketing is not |
| `docs/analysis/01_SOURCE_SYNTHESIS.md` | ✅ Bannered, DOCS-4 · not stale | A record of what the source material said on a date, so it does not expire the way an audit does. Only its §9 codebase inventory is time-bound |
| `docs/PRD.md` | ✅ Bannered, DOCS-4 · superseded | The original one-page PRD, an input to the analysis pack rather than an output of it. Its API sketch omits the `/api/v1` base and most modules, Flutterwave was never integrated, and the primary colour it names is not the one in `src/styles.css` |
| `docs/analysis/02_MASTER_PRD.md` | ✅ Bannered, DOCS-4 · still the baseline | Nothing has replaced it, and §3 and §4 are still what "intended behaviour" means in a story argument. It specifies the whole product, and the MVP is a subset, so the scope cut lives in §7 below and in `docs/adr/` rather than in it |
| `docs/LOCAL_DEVELOPMENT.md`, `docs/VERCEL_VALIDATION.md` | ✅ Corrected, E7-S5 | Both offered `prisma db seed` as routine housekeeping. The seed's first act is `deleteMany()` on 24 tables against whatever `DATABASE_URL` points at, and both documents point it at the shared cloud Postgres. Neither said so. Both now pass `SEED_NO_WIPE=1` and say why |
| `docs/PARALLEL_AGENT_PROMPTS.md` | ✅ Bannered, DOCS-4 · stale, 2026-05-26 | A wave plan for Steps 3 to 5, all merged. It hands out `cursor/<topic>-e4ea` branch names, tells an agent to tick `[x]` in the checklist, and predates the diff coverage bar and the board check. Dangerous because it reads like a live instruction rather than a record |
| `docs/VISUAL_QA_AGENT_PROMPT.md` | ✅ Bannered, DOCS-4 · stale, 2026-05-26 | The prompt that ran the stabilization sprint. The sprint finished and its output is `QA_FINDINGS.md`. Its standing order, do not start Step 6 and later, is spent: PoA, escrow and the DD wizard all shipped after it |
| `docs/demo-script-checklist.md` | ✅ Bannered, DOCS-4 · usable but partial | Not stale. Every route in it still exists and the seed password still works. It covers none of standalone DD, escrow, PoA, KYC or notifications, and it names 5 of the 27 accounts in `DEMO_TEST_ACCOUNTS.csv`. Bannered as a subset of the demo rather than the demo |

**First housekeeping action, before any story:** reconcile `BUILD_CHECKLIST.md` against this document, and mark the stale analysis files with a header that points here. In the reference project's paradigm this is a `DOCS-1` chore, size S, and it is worth doing because the checklist is what every AI agent on this repo reads first.

> **Done, 2026-07-29, and the reason it was first still holds.** DOCS-1 reconciled the checklist and DOCS-2 bannered six documents, all six pointing at `HANDOVER.md` for current state and here for current gaps. What the row above cannot say is what the reconcile cost: the checklist had been `[x]` on the listing DD lifecycle for long enough that two later documents inherited the claim. The banners are deliberately loud and deliberately non-destructive. Nothing was deleted, because a stale document is evidence of what was believed and when, and the only thing wrong with it is a reader who cannot tell.
>
> **Finished, 2026-08-02, by DOCS-4.** Six documents had been missed. Three were agent-facing, two prompt packs that read as live instructions and a demo walkthrough that is still correct but no longer complete, and that is the worse half of the problem: a stale audit misleads a reader, a stale prompt misleads a worker. One was `PRD.md`, the original one-page brief, still sitting in `docs/` under a name that invites a reader to treat it as the requirements. The last two, `01_SOURCE_SYNTHESIS.md` and `02_MASTER_PRD.md`, are not stale at all, and the reason to banner them is the same reason in reverse: three of the five analysis files carried a warning and two did not, so silence could mean current or could mean unchecked and a reader had no way to tell.
>
> Twelve files now carry a banner, up from six, and **this table is the inventory**. If a file in `docs/` is not listed here, it is live and current. Three live files were corrected rather than bannered, because the fault was a stale sentence rather than a stale document: `DEVELOPMENT_GUIDE.md` still called `BUILD_CHECKLIST.md` the work queue, and `GIT_WORKFLOW.md` and `BRANCH_PROTECTION.md` both described the required gate as three jobs when six now sit behind it, the two end-to-end suites and the board check having been added since.

---

## 3. Board

Status: `📋 planned` · `🔨 in progress` · `👀 in review` · `✅ merged` · `⛔ blocked` · `🚫 superseded`
Size: S is about a day · M is two to four days · L is about a week
🔴 CP marks the critical path to a launchable product.
A merged row carries the pull request that closed it, so every ✅ is traceable to a diff. Sub-stories earn a row here only while they are outstanding: the ones that have merged are recorded in their parent's detail section in section 4, and the handover week's own chores live on `docs/mvp-board.html`, which tracks that week at PR grain.

| ID | Epic | Story | Flag | Size | Status | Deps |
| --- | --- | --- | --- | --- | --- | --- |
| DOCS-1 | Chore | Reconcile the checklist and mark stale analysis docs | — | S | ✅ direct commit | none |
| CH-1 | Chore | Feature-flag service with kill switch, server and client | — | M | ✅ PR #128 | none |
| E1-S1 🔴 | Loop | Listing DD case lifecycle: queue, assign, report, complete | `dd_case_lifecycle` | L | 📋 | D1 |
| E1-S2 🔴 | Loop | Transaction state machine, DD_PURCHASED to DD_COMPLETE | `dd_case_lifecycle` | M | 📋 | E1-S1 |
| E1-S3 🔴 | Loop | Buyer DD report delivery, access controlled | `dd_case_lifecycle` | M | 📋 | E1-S1, E3-S1 |
| E1-S4 🔴 | Loop | Property purchase step wired to the state machine | `property_purchase` | M | 📋 | E1-S2 |
| E2-S1 🔴 | Money | Seller payout destination, per-seller bank account | `payouts` | L | 📋 | E1-S4, D2 |
| E2-S2 🔴 | Money | Webhook idempotency, replay and freshness guard | — | M | ✅ #123 | none |
| E2-S3 | Money | Gateway refunds, not ledger-only | `payouts` | M | 📋 | E2-S1 |
| E2-S4 🔴 | Money | Production guard on payment mock mode | — | S | ✅ #99 | none |
| E2-S5 | Money | Finance reconciliation view | — | M | 📋 | E2-S1, E4-S1 |
| E3-S1 🔴 | Trust | Authorized document access, retire the public static route | `secure_docs` | M | ✅ #103–112, six sub-stories | none |
| E3-S2 🔴 | Trust | Durable object storage in production | — | M | 📋 | D4 |
| E3-S3 | Trust | Upload hardening: type allow-list, magic bytes, AV hook | `secure_docs` | M | 📋 | E3-S2 |
| E3-S4 | Trust | Public PoA verification page | — | S | ✅ #98 | none |
| E4-S1 🔴 | Access | Enforce PermissionsGuard on every privileged endpoint | — | M | ✅ #121 | none |
| E4-S2 | Access | KYC gate on money-moving actions | `kyc_gate` | M | 📋 | E1-S4, D3 |
| E4-S3 | Access | Cross-role authorization test suite | — | M | ✅ #125 | E4-S1 |
| E5-S1 🔴 | Security | Rate limiting and lockout on auth and payments | — | M | ✅ #129 | none |
| E5-S2 🔴 | Security | CORS allow-list from configuration | — | S | ✅ #97, tightened by E5-S2a #102 | none |
| E5-S3 | Security | Password reset | `auth_recovery` | M | 📋 | E6-S1 |
| E5-S4 | Security | Email verification on self-registration | `auth_signup` | M | 📋 | E6-S1 |
| E5-S5 | Security | Session management: refresh rotation and revocation | `auth_sessions` | L | ✅ #131, flag off until a client refreshes | none |
| E5-S6 🔴 | Security | Fail closed when `JWT_SECRET` is unset | — | S | ✅ #119 | none |
| E6-S1 🔴 | Comms | SMTP configuration and delivery observability | — | S | 📋 | none |
| E6-S2 | Comms | Email channel for notification types | `email_notifications` | M | 📋 | E6-S1 |
| E6-S3 | Comms | Transactional email templates for the core journeys | `email_notifications` | M | 📋 | E6-S2 |
| E7-S1 | Ops | Structured logging, correlation id, error tracking | — | M | ✅ #122 | none |
| E7-S2 | Ops | Coverage thresholds and a CI coverage gate | — | S | ✅ #114, floor only | none |
| E7-S2b | Ops | Diff coverage: new and changed files meet the strict bar | — | M | ✅ #127 | E7-S2 |
| E7-S3 | Ops | End-to-end journeys in CI against an ephemeral database | — | L | ✅ #132 | E7-S2 |
| E7-S4 | Ops | Deterministic demo seed and reset | — | M | 📋 | E3-S2 |
| E7-S5 | Ops | Runbook, environment matrix, secrets checklist | — | S | ✅ #117 | none |
| E7-S6 | Ops | Health and readiness probes with dependency checks | — | S | ✅ #101 | none |
| E7-S6b | Ops | Container healthcheck polls the readiness probe | — | S | ✅ #120 | E7-S6 |
| E8-S1 | Compliance | NDPR consent, retention, and erasure | `privacy_centre` | L | 📋 | E5-S5 |
| E8-S2 | Compliance | Legal review of the PoA instrument and terms | — | S | ⛔ | external |
| E8-S3 | Compliance | Pre-launch security review | — | S | ⛔ | external, E4-S3 |
| E8-S4 | Compliance | Public web surface: robots, sitemap, per-route metadata | — | M | ✅ #130 | none |

### 3.1 Critical path

```
E3-S2 (durable storage)
  → E1-S1 (DD case lifecycle)
    → E1-S2 (state machine)
      → E1-S3 (report delivery)      [also needs E3-S1]
      → E1-S4 (property purchase)
        → E2-S1 (payout destination)
          → E7-S3 (E2E in CI)
            → launch gates G1 to G6
```

`E2-S2`, `E2-S4`, `E3-S1`, `E4-S1`, `E5-S1`, `E5-S2` and `E6-S1` have no upstream dependency and should be picked up in any idle slot. Together they are about 9 days and they close the highest-severity findings in this document.

> **Reconciled 2026-07-31.** Three of those seven have merged: E2-S4 (#99), E5-S2 (#97) and E3-S1 (#103 to #112). **What is left with no upstream dependency is `E2-S2`, `E4-S1`, `E5-S1` and `E6-S1`, about 5 days**, and E6-S1 is not really idle-slot work any more because it waits on EXT-3. The critical path above is otherwise unchanged, with one edit that matters: `E1-S3` still reads *also needs E3-S1*, and that clause is now satisfied. E1-S3 is gated on E1-S2 alone.

### 3.2 Go-live gates

| Gate | Meaning | Owner | Blocked by |
| --- | --- | --- | --- |
| G1 | A buyer completes the on-platform journey on staging without staff intervention | Engineering | E1 |
| G2 | A test payout reaches a distinct seller account and a test refund is repaid by the gateway | Engineering plus Finance | E2 |
| G3 | No private document is reachable without authorization, verified by an unauthenticated probe suite | Security | E3, E4-S3 |
| G4 | Signed PoA instrument and terms of service approved by counsel | Client, external | E8-S2 |
| G5 | Independent security review closed with no high findings outstanding | External | E8-S3 |
| G6 | Escrow and settlement model confirmed against CBN and AML obligations | Client, external | D2 |

> **G3 is half-earned, 2026-07-31.** The probe suite it asks for exists — `backend/src/storage/uploads-exposure.spec.ts`, written red in #103 and green since #112 — and no private document is reachable without authorization through the route it probes. The gate stays open because it is blocked by E3 and E4-S3, not by E3-S1: **E3-S2** is unstarted, and a document store that authorizes correctly and then loses the file on the next deploy does not pass a gate worded *no private document is reachable without authorization* in spirit, only in letter. Read the probe suite as the evidence G3 will eventually be closed with, not as the closing of it.
>
> **E4-S3 landed, 2026-08-01.** The other half of the gate's E4 dependency is now covered: `backend/src/common/authz/cross-role-authz.spec.ts` classifies all 51 path-parameter routes and drives 240 cross-role cells against the real services. G3 still waits on E3-S2, which is the storage half and has not started.

### 3.3 External inputs

Work the team cannot do with code.

| ID | Input | Owner | Blocks |
| --- | --- | --- | --- |
| EXT-1 | Production Paystack live keys and a settlement account | Client | E2-S1, G2 |
| EXT-2 | S3-compatible bucket, credentials, region decision | Client or Corne Labs | E3-S2 |
| EXT-3 | Transactional email domain, SPF, DKIM, DMARC, SMTP credentials | Client | E6-S1 |
| EXT-4 | Counsel-approved PoA instrument text and terms of service | Client | E8-S2, G4 |
| EXT-5 | NDPR privacy notice and retention policy | Client | E8-S1 |
| EXT-6 | Penetration test vendor and window | Corne Labs | E8-S3, G5 |
| EXT-7 | Confirmation of D1 and D2 | Client | E1, E2 |

---

## 4. Stories

Each story states the user value, the acceptance criteria a reviewer can check, the technical notes a developer needs, and the evidence for the gap.

---

### Epic E1, close the on-platform transaction loop

**Stakeholder value.** Today the platform can take due diligence money for a listed property and then cannot deliver the case, cannot report on it, and cannot sell the property. This epic makes the flagship journey finish.

---

#### E1-S1, listing DD case lifecycle

> **As** an operations officer, **I want** due diligence orders raised against a platform listing to appear in my queue so that I can assign professionals, collect their reports, and complete the case, **so that** a buyer who paid for due diligence receives it.

**Size** L · **Flag** `dd_case_lifecycle` · **Deps** D1

**Evidence of the gap**

- `backend/src/due-diligence/due-diligence.service.ts` is 104 lines and exposes one method, `create()` at line 34.
- `backend/src/due-diligence/due-diligence.controller.ts` exposes one route, `@Post()` at line 17.
- `src/routes/dashboard.admin.due-diligence.tsx:10` and `:52` read from `useStandaloneDdOrdersQuery`, so the admin due diligence queue only ever shows standalone orders.
- The full lifecycle it needs already exists next door in `backend/src/standalone-dd/standalone-dd.service.ts` (1590 lines) and `DueDiligenceAssignment` is already in the schema at `prisma/schema.prisma:414`.

**Acceptance criteria**

1. `GET /due-diligence-orders` returns the caller's own orders for a buyer and all orders for an operator, paginated, filterable by status.
2. `GET /due-diligence-orders/:id` returns one order with its listing, its selected schedule items, its assignments, and its reports. A buyer who does not own the order receives 404, not 403, so the endpoint does not confirm existence.
3. `POST /due-diligence-orders/:id/assignments` assigns a verified professional to a schedule. Assigning an unverified professional returns 422 with a message naming the missing credential.
4. `POST /due-diligence-assignments/:id/report` accepts a report upload from the assigned professional only. Any other caller receives 404.
5. `PATCH /due-diligence-orders/:id` moves the order `PAID` to `IN_PROGRESS` to `COMPLETE`, requires a verdict on completion, and rejects any transition that is not in the state table.
6. Every transition writes an `AuditLog` row and raises the matching notification to buyer, seller, and assigned professionals.
7. Behind `dd_case_lifecycle`. With the flag off, the new routes return 404 and existing behaviour is unchanged.
8. Unit tests cover every transition and every rejected transition. New code meets the ratchet bar in section 0.3.

**Technical notes**

Do not copy `standalone-dd.service.ts`. Extract the shared case machinery into a `dd-core` provider that both modules consume, otherwise this becomes a 1590-line duplicate and the two paths drift. `ServiceRequest.source` already distinguishes `LISTING` from `STANDALONE`, so the same tables serve both. The reviewer should block a copy-paste implementation on the SOLID and duplication rules.

---

#### E1-S2, transaction state machine

> **As** a buyer, **I want** my transaction to advance as the due diligence work progresses, **so that** I can see where my purchase stands and move on to buying the property.

**Size** M · **Flag** `dd_case_lifecycle` · **Deps** E1-S1

**Evidence of the gap**

- `TransactionStatus` declares `DD_IN_PROGRESS` and `DD_COMPLETE` at `prisma/schema.prisma:77`, and the only code that ever sets them is `backend/src/standalone-dd/standalone-dd.service.ts:1066` and `:1206`.
- `backend/src/verification/verification.service.ts` never references `Transaction` or `TransactionStatus`, so completing verification does not advance the purchase.
- Result: a listing transaction stops at `DD_PURCHASED` permanently.

**Acceptance criteria**

1. Completing the first assignment on a listing DD order moves the transaction to `DD_IN_PROGRESS`.
2. Completing the order with a verdict moves the transaction to `DD_COMPLETE` and notifies the buyer.
3. Transitions are declared in one table and enforced in one place. An illegal transition throws a mapped 409, never a 500.
4. The transition and the order update happen in a single database transaction. A failure after the order update cannot leave the transaction status behind.
5. Replaying the same completion is idempotent and does not re-notify.
6. Tests assert the legal transition set and at least four rejected transitions.

---

#### E1-S3, buyer DD report delivery

> **As** a buyer, **I want** to download the due diligence report I paid for, **so that** I have the document I bought and nobody else does.

**Size** M · **Flag** `dd_case_lifecycle` · **Deps** E1-S1, E3-S1

**Evidence of the gap**

`DueDiligenceOrder.reportStorageKeys` exists at `prisma/schema.prisma:371`. For listing orders nothing writes it and nothing reads it. Standalone orders resolve reports through `standalone-dd.service.ts:432` to `:440`, which currently returns `getSignedUrl`, and for the local driver that returns a plain unauthenticated `/uploads/{key}` path (`backend/src/storage/storage.service.ts:58` to `:63`).

**Acceptance criteria**

1. `GET /due-diligence-orders/:id/reports` returns short-lived download links for the owning buyer and for operators with `dd.orders.read`.
2. Links expire in 15 minutes or less and are single-purpose. Sharing an expired link yields 403 from storage, not the file.
3. An unauthenticated request, and a request from a different buyer, both receive 404.
4. Each issued link writes an `AuditLog` row naming the actor, the order, and the key.
5. The buyer due diligence screen shows report availability and download state, including the case where the order is complete but no report was attached.

---

#### E1-S4, property purchase step

> **As** a buyer whose due diligence came back clean, **I want** to pay for the property through the platform, **so that** my money sits in escrow rather than going directly to a stranger.

**Size** M · **Flag** `property_purchase` · **Deps** E1-S2

**Evidence of the gap**

`src/routes/dashboard.buyer.transactions.tsx:225` gates the property purchase path on `["DD_COMPLETE","PURCHASE_PENDING","PURCHASE_IN_ESCROW","COMPLETED"].includes(tx.status)`. Since E1-S2 shows nothing reaches `DD_COMPLETE` on the listing path, this branch is dead code today. The payment side is ready: `backend/src/payments/payments.service.ts:290` handles `PROPERTY_PURCHASE` and `:317` calls `escrow.hold`.

**Acceptance criteria**

1. The property purchase action appears only when the transaction is `DD_COMPLETE` and the buyer's KYC allows it, per E4-S2.
2. Initiating it moves the transaction to `PURCHASE_PENDING` before the gateway call, so an abandoned checkout is distinguishable from one never started.
3. A successful payment moves the transaction to `PURCHASE_IN_ESCROW` and creates or updates the escrow hold for the full amount, not the deposit.
4. A failed or abandoned payment returns the transaction to `DD_COMPLETE` and leaves no escrow row.
5. The buyer sees the escrow state, the held amount, and the outstanding release conditions.
6. A verdict of concern on the due diligence order blocks the purchase action and shows the reason.

**Technical note.** `src/routes/dashboard.buyer.transactions.tsx:236` to `:237` pays a computed `deposit` for due diligence and the full listing price for purchase, and `:112` and `:254` store and read the payment id from `localStorage`. Move that association server side while this story is open, since a cleared browser currently loses the link between a transaction and its payment.

---

### Epic E2, money integrity

**Stakeholder value.** Escrow only means something if the money it releases arrives at the right person, and a refund only means something if the buyer gets their money back. Neither is true today.

---

#### E2-S1, seller payout destination

> **As** a seller, **I want** my escrow release to arrive in my own bank account, **so that** selling through the platform actually pays me.

**Size** L · **Flag** `payouts` · **Deps** E1-S4, D2

**Evidence of the gap**

`backend/src/payments/paystack.service.ts:119` to `:131` resolves the payout account from `PAYSTACK_PAYOUT_BANK_CODE` and `PAYSTACK_PAYOUT_ACCOUNT_NUMBER`, defaulting to `"057"` and `"0000000000"`, Paystack's test Zenith account. The recipient is created from the seller's name only. There is no bank account field anywhere in `prisma/schema.prisma`. Every payout in the system goes to one account.

**Acceptance criteria**

1. A `SellerPayoutAccount` model holds bank code, account number, resolved account name, Paystack recipient code, verification state, and timestamps. Account numbers are stored encrypted at rest or truncated for display, never logged.
2. Sellers add a payout account from their dashboard. The platform resolves the account name through Paystack and requires the seller to confirm the resolved name before it is saved.
3. `initiatePayout` uses the seller's stored recipient code. A seller with no verified account produces a `BLOCKED` payout with a clear reason, and notifies both the seller and finance. It never falls back to a default account.
4. Changing a payout account revokes the previous recipient, writes an audit row, and notifies the seller by email.
5. A payout is attempted at most once per transaction. The existing guard at `escrow.service.ts` `initiatePayout` is kept and covered by a test.
6. Behind `payouts`. With the flag off, release still works and records a `PENDING` payout for manual settlement.

**Technical note.** This is the story where D2 matters most. If SafeBuyRealties holds client funds rather than passing them through, the design changes from a bank-details form into a regulated settlement flow with reconciliation obligations. Do not start this story before D2 is answered.

---

#### E2-S2, webhook idempotency

> **As** the platform operator, **I want** a repeated gateway callback to have no extra effect, **so that** a network retry cannot double-notify, double-hold, or corrupt a transaction.

**Size** M · **Flag** none, this is a correctness invariant · **Deps** none

**Evidence of the gap**

`backend/src/payments/payments.service.ts:382` to `:405` looks up the payment by reference and calls `applyPaymentChargeSuccess` with no check on whether the payment is already `SUCCEEDED` and no record of processed events. Inside, `escrow.hold` at `:317`, `notifyDdPaymentSucceeded` at `:314`, and `guestCheckout.completePayment` at `:322` all re-run on a replay. The only idempotency in the codebase is Paystack's own outbound `idempotencyKey: "auto"` at `paystack.service.ts:49`, which does not protect inbound webhooks.

**Acceptance criteria**

1. A `ProcessedWebhookEvent` table records provider, event id, reference, event type, and processed timestamp, with a unique constraint on provider plus event id.
2. A duplicate event is acknowledged with 200 and performs no side effect.
3. An event whose timestamp is older than a configured window is rejected and logged as suspicious.
4. `applyPaymentChargeSuccess` exits early when the payment is already `SUCCEEDED`.
5. A concurrency test fires the same event twice in parallel and asserts exactly one escrow hold, one notification set, and one status change.
6. The unknown-reference path stays a 200 acknowledgement so the gateway does not retry forever.

---

#### E2-S3, gateway refunds

> **As** a buyer whose purchase fell through, **I want** the refund to reach my card or account, **so that** a refunded escrow means my money came back.

**Size** M · **Flag** `payouts` · **Deps** E2-S1

**Evidence of the gap**

`backend/src/escrow/escrow.service.ts` `refund()` updates the escrow row to `REFUNDED`, sets the listing back to `VERIFIED`, writes an audit row, and notifies both parties. It never calls Paystack. No refund API call exists anywhere in `backend/src/payments/paystack.service.ts`.

**Acceptance criteria**

1. Refund calls the gateway refund API against the original charge and records the gateway reference and state.
2. A refund is a two-phase operation: `REFUND_PENDING` on request, `REFUNDED` only when the gateway confirms.
3. A gateway failure leaves the escrow `HELD`, surfaces the failure to the operator with the gateway message, and does not release the listing.
4. Partial refunds are supported or explicitly rejected with a documented reason. Do not silently treat a partial as a full.
5. A refund webhook updates the escrow, and is covered by the E2-S2 idempotency ledger.

---

#### E2-S4, production guard on mock mode

> **As** the platform operator, **I want** the application to refuse to start in production without payment credentials, **so that** a missing key can never present a fake payout as a real one.

**Size** S · **Flag** none · **Deps** none

**Evidence of the gap**

`backend/src/escrow/escrow.service.ts` `initiatePayout` branches on `!this.paystack.isConfigured()` and records the payout as `COMPLETED` with a `mock_transfer_...` reference. `paystack.service.ts:21` to `:26` also honours `PAYSTACK_FORCE_MOCK`. Nothing checks the environment. A production deploy with a missing or blanked key silently reports every seller as paid.

**Acceptance criteria**

1. Startup fails with a clear message when `NODE_ENV` is production, or `VERCEL_ENV` is production, and no Paystack secret key is present.
2. `PAYSTACK_FORCE_MOCK` is ignored outside development and test, and logs a warning if set.
3. Mock payouts and mock payments carry an explicit `isMock` flag on the record and render with a visible badge in every operator view.
4. `GET /health` reports payment configuration state without leaking the key.
5. A test asserts the startup failure and a test asserts the badge.

**✅ Merged in #99, day 2.** `backend/src/config/payments-guard.ts` is the guard and `payments-guard.spec.ts` is its proof; the branch quoted above still exists, but production can no longer reach it, because the application refuses to boot into it. That is the shape worth noting for the rest of the money epic: the mock path was not deleted, it was made unreachable where it lies, which keeps it available to development and test without leaving a production failure mode behind. It closed the single worst failure mode in the repository and it was a one-day story.

---

#### E2-S5, finance reconciliation view

> **As** a finance manager, **I want** one screen reconciling payments in, escrow held, payouts out, and platform fees, **so that** I can close a period without exporting the database.

**Size** M · **Flag** none · **Deps** E2-S1, E4-S1

**Evidence of the gap**

`backend/src/admin/admin.controller.ts` exposes one route, `GET /admin/analytics`. `src/routes/dashboard.admin.index.tsx:109` renders `RevenuePlaceholderChart`, and `src/components/dashboard/AdminAnalyticsCharts.tsx:103` generates its series from a `revenuePlaceholder` function. The Finance Manager admin role exists in the seed and has no finance screen.

**Acceptance criteria**

1. `GET /admin/finance/reconciliation` returns, for a date range, payments by intent and status, escrow held and released and refunded, payouts by status, and platform fees earned.
2. The endpoint requires the `escrows.read` privilege, enforced per E4-S1.
3. Every figure links through to the underlying rows.
4. Amounts are computed with `Prisma.Decimal`, never JavaScript floats, and the response carries currency explicitly.
5. `RevenuePlaceholderChart` is deleted, not left behind a flag.

---

### Epic E3, document trust

**Stakeholder value.** The product sells document trust. Right now uploaded documents are world-readable and, in production, impermanent.

---

#### E3-S1, authorized document access

> **As** a seller who uploaded a title deed, **I want** only permitted people to open it, **so that** listing a property does not publish my documents.

**Size** M · **Status** ✅ done, split into four and then six · **Flag** `secure_docs`, see criterion 6 · **Deps** none

**Evidence of the gap** (as found on `main` @ `fc05e1e`, retained as the record)

`backend/src/main.ts:23` mounts `app.use("/uploads", express.static(resolveUploadRoot()))` before any guard. `backend/src/storage/storage.service.ts:58` to `:63` returns `/uploads/{key}` for the local driver, which is the default (`STORAGE_DRIVER` defaults to `local` at `storage.service.ts:40`). `vite.config.ts` proxies `/uploads` straight through in development. Every KYC document (`kyc.service.ts:77`, `:133`), professional credential (`professionals.service.ts:263`), listing document, and DD report resolves to a public path. Anyone who obtains a storage key can fetch the file with no session.

The mount moved to `backend/src/app-bootstrap.ts:39` behind the E3-S1b gate, and E3-S1d-3 (PR #112) deleted both. Express middleware runs ahead of the Nest router, so a guard on a controller could never have protected that path — which is why the authorized read path had to be a Nest route rather than a signed URL, and why the mount had to go rather than be guarded. `configureApp()` now begins at `app.use(cookieParser())`. The probes in `uploads-exposure.spec.ts` still run against the app with no mount in it: an assertion that the mount is absent would pass on an app that had one and served nothing, and would say nothing about an app that had one and served everything.

**The split.** One PR could not carry this once the middleware order was understood, so the story was cut into four. Each landed with a probe or a regression test that fails if the fix is reverted.

| Sub-story | Scope | Status |
| --- | --- | --- |
| E3-S1a | Executable probe proving private documents were served with no session | ✅ merged, PR #103 |
| E3-S1b | Category gate in front of the static mount, so it serves only public listing imagery | ✅ merged, PR #104 |
| E3-S1c | Authorized read path for `kyc/` and `professionals/` on both storage drivers | ✅ merged, PR #106 |
| E3-S1d | DD reports, POA documents, private listing documents, then remove the mount | ✅ merged in three: E3-S1d-1 PR #108, E3-S1d-2 PR #111, E3-S1d-3 PR #112 |

**Acceptance criteria**

1. ✅ **for every family the application writes.** `StorageService.getSignedUrl()` resolves a private key to `GET /api/v1/documents/file?key=<storage key>`, a Nest route that authorizes each request against the live session. **Route shape deviates from the wording and the deviation is load-bearing:** neither family has a document id to route by. `Document` rows are listing-scoped (`schema.prisma:188`, `listingId` non-null), KYC keys live in `kyc_records.documentKeys` as a JSON array with no per-document row (`schema.prisma:543`), and credential keys are two columns on `ProfessionalProfile` (`schema.prisma:321` to `:323`). The route keys on the thing that exists.
2. ✅ **done, and the second sentence was superseded twice.** Moving public imagery to a separate prefix would need a data migration against the shared cloud Postgres, which the handover working agreement forbids. E3-S1b reached the same guarantee without one, with a gate in front of the mount. E3-S1d-3 then made the gate unnecessary rather than moving it: `GET /api/v1/documents/file` takes optional authentication, so the one authorized route decides per `Document` row and serves `listing_hero` and `listing_gallery` to a caller with no session while refusing the title deed one row away. With no family left resolving to it, the mount, the gate and the `/uploads` rewrite in `vercel.mjs` and `vite.config.ts` were all deleted. Two gates on one prefix is how the next leak gets in, so there is now one.
3. ✅ **for every family, with a deliberate status-code deviation.** 401 with no session, 403 for a caller who may not read this owner's documents, 404 for a key that names nothing readable. Authorization is decided before storage is touched, so a real key and an imaginary one are indistinguishable to a refused caller and there is no existence oracle. A blanket 404 would also mean answering 404 to a caller who supplied the key themselves, which conceals nothing and makes a genuine permissions problem unreportable in the UI.
4. ✅ **for every family, with one deliberate silence.** `PRIVATE_DOCUMENT_READ` and `PRIVATE_DOCUMENT_READ_DENIED` carry actor, key, owner, role and IP. A served public listing image writes nothing: it is an anonymous page load, the audit log would fill with rows naming no actor, and the refusal beside it is still recorded in full.
5. ✅ **done.** The walk covers `kyc/` and `professionals/` (anonymous, wrong buyer, wrong seller, wrong professional), the DD and POA families, and the deny-everything probes in `uploads-exposure.spec.ts`. The every-category walk arrived with E3-S1d-3, once there was a policy for every category to walk: an `it.each` over `LISTING_CATEGORIES` in `private-document.controller.spec.ts` fetches one document of every category the seller upload form offers, with no session, and asserts the outcome that category's `public` flag predicts — and a companion test checks that flag against `PUBLIC_LISTING_ASSET_CATEGORIES`, so widening the public list without widening the walk fails. `Document.category` is a bare `String` in the schema (`:192`), so no test can prove the list is exhaustive; a category invented outside it is refused by default, which is the safe direction.
6. 🚫 **not implementable as written, and since answered elsewhere.** When this story shipped there was no feature-flag mechanism anywhere in the repository: no flag table, no config lookup, no `featureFlag` helper. Building one was a story of its own rather than a line item inside this one, and every story in this document carrying a **Flag** field inherited the same problem. **CH-1 has since built it**, so the stories still to come can meet this criterion; this one is left as it merged rather than retro-fitted, because gating a shipped and audited read path is a behaviour change nobody asked for.

**Scope note for E3-S1d, from a read of the remaining families**

The three remaining families cannot reuse E3-S1c's authorization model. That model derives the owner from a key segment, because `kyc/<userId>/…` and `professionals/<userId>/…` both put the owner's id in the key and both key builders take it from the uploader's own JWT subject. **None of the remaining families contains a user id.** Each needs a database lookup over a different relation graph:

| Family | Key shape | Who may read | Lookup |
| --- | --- | --- | --- |
| DD reports | `due-diligence/<orderId>/reports/…` and `…/assignments/<assignmentId>/…` | ordering buyer, assigned professional, operators | `DueDiligenceOrder.buyerId` (`schema.prisma:375`) plus `DueDiligenceAssignment.professionalId` (`:418`) |
| POA | `poa/<transactionId>/…` | POA buyer, transaction counterparty, operators | `PowerOfAttorney.buyerId` (`:464`) to `Transaction` (`:244`) to `Listing.sellerId` (`:138`) |
| Listing documents | `listings/<listingId>/…`, non-media categories | seller, counterparty in an active transaction, assigned professionals, operators | `Document.listingId` (`:188`) and `uploadedById` (`:190`), and it must not fight the E3-S1b public gate |

So `private-documents.ts` is the extension point for the **routing** table only. The **policy** record needs a new async, Prisma-backed authorize step, and `StorageModule` needs a Prisma dependency it does not have today. PR #106's review note called the addition pure; that is true of routing and not of authorization, and this table is the correction.

E3-S1d also loses the property that kept E3-S1c small. C changed no frontend code because both its families already flowed through `getSignedUrl()`, so the emitted field changed value and not shape. Of the remaining three, only DD reports do the same (`standalone-dd.service.ts:438`, `:517`, `:540`). POA emits `pdfStorageKey` and `qrCodeStorageKey` raw and never calls `getSignedUrl()` at all (`poa.service.ts:280`, `:282`), and listing documents emit `storageKey` raw (`documents.service.ts:63`), with the frontend building `/uploads/${storageKey}` itself at `src/routes/purchase.$listingId.tsx:54` and `src/routes/listings.$listingId.tsx:34`. Those two need API response-shape changes and matching frontend edits.

Both landed. E3-S1d-3 replaced `DocumentDto.storageKey` with a `url` the API builds, so the client no longer constructs a path into the bucket; `purchase.$listingId.tsx` reads it directly. One key-based builder survives at `listings.$listingId.tsx`, pointed at the authorized reader rather than the mount, because `ListingMediaDto` still carries a raw `storageKey` — and `ListingMedia` has no writer anywhere in the application, so that array is always empty and the code is unreached. The string it builds confers nothing: the reader re-authorizes every request. Making `ListingsService` emit a URL means injecting `StorageService` and making `toDto` async to serve an empty table, which is left for whoever gives that table a writer.

**How E3-S1d actually split, and why the suggestion was wrong.** The proposal recorded here in #107 was two sub-stories: DD reports first, then POA and listing documents and the mount removal together. It shipped as three, and the second half of that proposal was the part that did not hold. POA and listing documents look alike from the outside — both need a Prisma lookup, both emit a raw key — and they are not alike in the diff. POA is backend only: `serialize()` hands out `pdfStorageKey` and `qrCodeStorageKey` and never calls `getSignedUrl()`, so giving it a policy changes one service. Listing documents are the mixed family, public photographs beside title deeds in one prefix, and they are what held the mount open; closing them meant a `DocumentDto` shape change, two frontend routes, and deciding what replaces the mount for public imagery. Bundling those into one sub-story would have put the only real design decision of the epic in the same PR as a mechanical one.

| Sub-story | What it carried | PR |
| --- | --- | --- |
| E3-S1d-1 | DD reports, and with them the Prisma-backed policy shape the other two reuse. No frontend change | ✅ #108 |
| E3-S1d-2 | POA documents. Backend only, one service, no response-shape change | ✅ #111 |
| E3-S1d-3 | Private listing documents, the `DocumentDto` shape change and its frontend edits, then the mount, the E3-S1b gate and the `/uploads` rewrites all deleted. Closed E3-S1 | ✅ #112 |

The design decision E3-S1d-3 arrived at is not the one the proposal anticipated either. The proposal assumed a replacement public-delivery route beside the authorized one. What shipped made `GET /api/v1/documents/file` take optional authentication instead, so one route decides per `Document` row rather than two routes guarding one prefix. Criterion 2 above records why.

**Carried debt.** `Document.storageKey` has no index (`schema.prisma:196`). The E3-S1b gate resolves every public image request by storage key, so each one is a sequential scan. Harmless at MVP volume, but `@@index([storageKey])` belongs in the next migration this project is allowed to run.

---

#### E3-S2, durable object storage in production

> **As** a buyer, **I want** the report I downloaded yesterday to still be there today, **so that** the platform's documents are permanent records.

**Size** M · **Flag** none · **Deps** D4

**Evidence of the gap**

`backend/src/storage/storage.service.ts:22` to `:30`: when running on Vercel with a relative or unset upload directory, the local root becomes `/tmp/safebuyrealties-uploads`. Vercel serverless `/tmp` does not persist between invocations. `backend/.env.example` lists the S3 variables. This entry used to cite `backend/.env.vercel.prod` as proof that production sets no `STORAGE_DRIVER` and no AWS keys; that file has since been untracked, and it never supported the claim — it holds `VERCEL_*`/`TURBO_*` build metadata and carries no `DATABASE_URL` either, which production certainly has. **The production storage driver is not knowable from this repository and must be read from the Vercel dashboard.** If it is `local`, uploads written in production are effectively write-only.

**Acceptance criteria**

1. `STORAGE_DRIVER=s3` is required in production. The application refuses to start on a serverless platform with the local driver.
2. Bucket policy denies public reads. **Reworded after E3-S1c**: this used to read "all access is through pre-signed URLs from E3-S1", which is now wrong for private families. A pre-signed URL is a bearer capability, an hour of access to whoever holds it with no session and no role check, so it cannot express "the owner and platform operators only". Private keys are read through `PrivateDocumentController`, which authorizes each request and only then asks the driver for the bytes. Pre-signed URLs remain correct for public listing media. `storage.service.spec.ts` configures the s3 driver with no credentials at all and asserts a private key still resolves to the authorized reader, so a future change that presigns one fails the suite.
3. Server-side encryption is enabled and object versioning is on, so an accidental overwrite is recoverable.
4. A one-off migration copies any recoverable existing objects and reports the keys it could not find, rather than failing silently.
5. `docs/LOCAL_DEVELOPMENT.md` documents the local driver as development only.
6. Storage failures raise a mapped 502 with a correlation id, never an unhandled 500.

---

#### E3-S3, upload hardening

> **As** the platform operator, **I want** uploads restricted to expected document types and scanned, **so that** the document store is not a malware channel.

**Size** M · **Flag** `secure_docs` · **Deps** E3-S2

**Evidence of the gap**

`backend/src/documents/documents.controller.ts:24` to `:31` configures multer with `limits: { fileSize: 100 * 1024 * 1024 }` and no `fileFilter`. `backend/src/documents/documents.service.ts:93` to `:116` checks only `file.size` against the platform maximum, then stores `file.mimetype` as supplied by the client. There is no extension allow-list, no content sniffing, and no scanning. The same is true for KYC and professional credential uploads.

**Acceptance criteria**

1. An allow-list of PDF, JPEG, PNG, and WebP is enforced per category, by extension and by magic bytes, not by the client-supplied MIME type.
2. The multer limit is derived from `PlatformConfig.maxUploadMb`, so the two limits cannot diverge.
3. Rejections return 422 naming the accepted types, never a 500.
4. A scanning port is defined with a no-op adapter for development and a real adapter behind configuration. A file that fails scanning is quarantined, not stored, and the uploader is notified.
5. Filenames are never used to build storage paths. Keys stay server-generated.
6. Tests cover a renamed executable, an oversized file, a zero-byte file, and a valid file of each accepted type.

---

#### E3-S4, public PoA verification page

> **As** anyone holding a signed Power of Attorney, **I want** to scan its QR code and confirm it is genuine, **so that** the document's integrity claim is real.

**Size** S · **Flag** none · **Deps** none

**Evidence of the gap**

`backend/src/poa/poa.service.ts:18` sets `VERIFY_BASE_URL = "https://safebuyrealties.com/verify"` and encodes it into the QR on every generated instrument. `src/components/PoAExecutionScreen.tsx:185` shows the same URL to the buyer. There is no `verify` route in `src/routes/`. Every QR code the platform has ever produced points at a 404. The backend endpoint `GET /poa/verify` exists and works.

**Acceptance criteria**

1. A public `/verify` route accepts a `hash` query parameter and calls `GET /poa/verify`.
2. A match shows the property, the execution date, and the document hash, and nothing else. No buyer contact details, no price.
3. A miss shows a clear not-found state and a route to contact support.
4. The page is server rendered with its own title, description, and canonical URL, and is indexable.
5. `VERIFY_BASE_URL` is read from configuration rather than hard coded, so staging QR codes point at staging.
6. A test asserts that a QR generated in the test environment resolves to a live route.

**✅ Merged in #98, day 2.** `src/routes/verify.tsx` is the page and `backend/src/config/poa-verify-config.ts` is criterion 5, so staging QR codes point at staging rather than at production. Worth keeping in view when reading the rest of E3: this story fixed nothing about how documents are stored or authorized. It made an integrity claim the platform was already printing on every instrument actually checkable, which is a different kind of gap from the one E3-S1 and E3-S2 describe, and it was cheap only because the backend endpoint had been there all along.

---

### Epic E4, access control correctness

**Stakeholder value.** The admin portal shows each operator only the menus their role allows. The API does not check the same thing, so the restriction is cosmetic.

---

#### E4-S1, enforce privileges on the API

> **As** a security reviewer, **I want** privileged endpoints to check the caller's privilege, **so that** a content manager cannot release escrow.

**Size** M · **Flag** none · **Deps** none

**Evidence of the gap**

`backend/src/common/permissions.ts` declares sixteen privileges including `ESCROWS_WRITE`, `PLATFORM_CONFIG`, `USERS_WRITE`, and `CATALOG_MANAGE`, and `PERMISSION_NAV_UNLOCKS` maps each to a menu section. `PermissionsGuard` is applied on exactly two controllers, `admin-roles.controller.ts:54` and `dd-cms.controller.ts` at six routes. Everything else gates on `@Roles(UserRole.STAFF, UserRole.ADMIN)`, including `escrow.controller.ts:13` to `:16`, `platform-config.controller.ts:22`, `users.controller.ts:25`, `kyc.controller.ts:61`, and `service-catalog.controller.ts:47`. `backend/prisma/seed.ts:206` to `:242` seeds Content Manager, Operations Officer, and Finance Manager all as `UserRole.ADMIN`. A Content Manager can therefore call `POST /escrow/:id/release`.

**Acceptance criteria**

1. Every privileged route declares a required privilege. A route with no declaration fails closed rather than defaulting to allow.
2. A lint rule or a test enumerates controllers and fails if any operator route lacks a privilege declaration, so the gap cannot reopen.
3. Attempting an action without the privilege returns 403 with the privilege name.
4. Super admin bypass, if it exists, is explicit, audited, and covered by a test.
5. A matrix test drives each seeded admin role against each privileged endpoint and asserts the expected allow or deny.
6. The frontend continues to hide unavailable menus, but the test suite proves the API is the enforcement point.

---

#### E4-S2, KYC gate on money-moving actions

> **As** a compliance officer, **I want** identity verification required before a buyer moves money or signs a Power of Attorney, **so that** the KYC we collect actually gates something.

**Size** M · **Flag** `kyc_gate` · **Deps** E1-S4, D3

**Evidence of the gap**

`KycRecord` exists at `prisma/schema.prisma:538` with a full submit and review flow in `backend/src/kyc/`. Outside that module the only reference in the entire backend is a dashboard count at `backend/src/admin/admin.service.ts:38`. No guard, service, or controller checks KYC status before payment, PoA execution, or payout.

**Acceptance criteria**

1. A configurable policy decides which actions require `VERIFIED` KYC. The MVP default is property purchase payment and PoA execution, and not due diligence purchase.
2. A blocked action returns 403 with a machine-readable reason and the frontend routes the buyer to the KYC screen with a return path.
3. The gate is enforced server side. Hiding the button is not sufficient and a test proves the API refuses.
4. Sellers require verified KYC before a payout account can be verified, per E2-S1.
5. Rejected KYC shows the reviewer's note and allows resubmission, and resubmission clears the previous rejection.
6. Behind `kyc_gate`, so the gate can be turned off for a demo without a deploy.

---

#### E4-S3, cross-role authorization test suite

> **As** the team, **I want** an automated suite that probes every resource from every wrong role, **so that** an object-level authorization regression fails CI rather than a pentest.

**Size** M · **Flag** none · **Deps** E4-S1

**Evidence of the gap**

Ownership checks are written per service, for example `escrow.service.ts` `assertCanViewEscrow`, `documents.service.ts` `toDocumentDto`, and `listings-public.helper.ts`. They are correct where they exist and there is no systematic check that they exist everywhere. The stronger shape for this class of problem is a fail-closed rule at the data layer, where a query that names no owner returns nothing, rather than a predicate repeated in every service. That is the direction to move, and this suite is what makes the move safe to attempt.

**Delivered** in PR #125. `backend/src/common/authz/` holds three files: a persona and store fixture with an in-memory Prisma double, a builder that constructs the real services against it, and the matrix spec. The spec has two halves. A census puts all 51 path-parameter routes into exactly one of four buckets, so a new one fails by name until somebody classifies it. A matrix then drives the real service method for 23 resource-scoped routes against ten personas, 240 cells, each compared to a table written by reading the predicates rather than running them. The table caught its own author on the first run: `GET /escrow/:transactionId` admits the listing's seller alongside the buyer, which had been written down as a denial.

Two findings came out of the census and are recorded in the suite itself. `GET /standalone-dd/orders/:serviceId` performs no authorization at all, and `GET /transactions/:id` refuses the seller of the listing being transacted, which is intended but is the kind of rule that breaks quietly.

**Acceptance criteria**

1. A fixture creates two buyers, two sellers, two professionals, and one of each admin role.
2. For every resource-scoped endpoint, the suite asserts owner allowed, other same-role user denied, wrong role denied, unauthenticated denied.
3. Denials are 404 where existence itself is sensitive and 403 where it is not, and the choice is documented per endpoint.
4. The suite runs in CI on every pull request.
5. Adding a new resource-scoped endpoint without a matching case fails the suite.

---

### Epic E5, account security

**Stakeholder value.** The auth system is clean and minimal. It is missing the controls that keep accounts safe once real users and real money arrive.

---

#### E5-S1, rate limiting and lockout

**Size** M · **Flag** none · **Deps** none

**Evidence of the gap.** `backend/package.json` has no throttling dependency. There is no `ThrottlerModule` in `app.module.ts` and no lockout logic in `auth.service.ts`. Login, registration, payment initiation, and the public guest checkout are all unlimited.

**Delivered** in PR #129, as two tiers that count different things, and neither of them added a dependency. The request throttle is a fixed-window counter per client address in `backend/src/common/throttle/`, mounted as the third `APP_GUARD` so a route is covered by the global policy unless it names a tighter one. Eight policies sit in a closed registry, `throttle.constants.ts`, each overridable through `THROTTLE_<KEY>` as `"<requests>:<seconds>"`. Under it, `backend/src/auth/login-attempts.service.ts` counts failed logins per account and per source address over a rolling hour and locks on a lengthening ladder, 5 failures for 60s, 10 for 300s, 20 for 1800s. It stores those attempts in the existing `AuditLog` table under `entity: "AuthAttempt"`, so the counter survives a restart with no schema change and no migration window on the shared cloud database.

Three decisions are worth carrying forward. The lockout is checked before the user lookup and keys on a sha256 of the email and of the address, so a locked answer is identical for a real account and an invented one and nothing readable is written to the row. Both tiers answer the same 429 and neither says which one refused, because a message that tells them apart is an oracle. And `TRUST_PROXY_HOPS` came with the story rather than before it: `req.ip` is what the limit counts, what the lockout keys on and what four audit call sites record, and with no hop count Express reported the load balancer for every caller. **It has to be set to 1 on Render**, which is an operator action, and `docs/RUNBOOK.md` §12 is the procedure.

What this did not close is written up in RUNBOOK §12.5. `POST /auth/login` answers "Account is deactivated" for a deactivated account and "Invalid email or password" otherwise, which tells a stranger whether an address exists. It is pre-existing, it is a message change rather than a guard, and it belongs with E5-S3.

**Acceptance criteria**

1. Global default limits plus tighter limits on login, registration, activation, password reset, payment initiation, and guest checkout.
2. Progressive lockout on repeated failed logins per account and per source address, returning 429 with `Retry-After`.
3. Limits are configuration driven and the counter store survives a process restart.
4. Webhook endpoints are exempt from the login limits and have their own.
5. Rate-limit rejections are logged with the correlation id from E7-S1 and never log credentials.
6. Tests assert the limit, the header, and the exemption.

---

#### E5-S2, CORS allow-list

**Size** S · **Flag** none · **Deps** none

**Evidence of the gap.** `backend/src/main.ts:43` to `:49` sets `origin: true` with `credentials: true`, `allowedHeaders: "*"`, and `exposedHeaders: "*"`. `origin: true` reflects whatever origin the request carries, so any website can make credentialed requests against the API using a visitor's session cookie. `backend/.env.example` documents `FRONTEND_URL` as a comma-separated allow-list, so the intent exists and was never implemented.

**Acceptance criteria**

1. Origins come from `FRONTEND_URL` as a comma-separated list, plus the documented Vercel preview pattern.
2. An origin not on the list is rejected. Reflection is removed.
3. `allowedHeaders` and `exposedHeaders` are explicit lists.
4. Startup fails in production when `FRONTEND_URL` is unset.
5. Tests assert an allowed origin, a rejected origin, and a preview-pattern origin.

**✅ Merged in #97, day 2, and tightened by E5-S2a in #102.** `backend/src/config/cors-config.ts` holds the allow-list and `main.ts:6` calls `assertCorsConfigured`, which is criterion 4. The follow-up is the part worth reading: the preview pattern criterion 1 asks for is a wildcard over a domain anybody can deploy to, so as first written it re-opened a narrower version of the hole it closed — a squatted preview subdomain would have been an allowed origin carrying credentials. E5-S2a bound the pattern to this project's own deployments. A story can meet all five of its criteria and still ship the bug, when one of the criteria is itself the loose part.

---

#### E5-S3, password reset

**Size** M · **Flag** `auth_recovery` · **Deps** E6-S1

**Evidence of the gap.** `auth.controller.ts` exposes register, login, logout, me, and the two account-activation routes. There is no forgot-password or reset-password route. A user who forgets their password today needs an administrator.

**Acceptance criteria**

1. `POST /auth/forgot-password` always returns 202, whether or not the address exists, so it cannot be used to enumerate accounts.
2. Tokens are single use, expire in one hour, and are stored hashed. The `AccountActivationToken` pattern already in the schema is the model to follow.
3. Completing a reset revokes all existing sessions for that user, which requires E5-S5 to be meaningful.
4. Reset attempts are rate limited per E5-S1 and audited.
5. Email delivery failure never leaks whether the address existed.

---

#### E5-S4, email verification on self-registration

**Size** M · **Flag** `auth_signup` · **Deps** E6-S1

**Evidence of the gap.** `auth.service.ts` `register()` at line 94 creates the account and signs the user in. Administrator-created accounts do go through `AccountActivationToken`, so the mechanism exists and self-registration bypasses it.

**Acceptance criteria**

1. Self-registered accounts start unverified and receive a single-use 24-hour verification link.
2. Unverified accounts can browse and cannot transact, upload documents, or submit KYC.
3. Resending a link is rate limited and invalidates the previous one.
4. Verification failure does not block signup, per the reliability rule that a mail outage must not take down registration.
5. A banner shows verification state with a resend action.

---

#### E5-S5, session management

**Size** L · **Flag** `auth_sessions` · **Deps** none

**Evidence of the gap.** `auth.module.ts:18` signs a JWT with `expiresIn: "7d"` and `auth.controller.ts:30` sets the cookie for the same seven days. There is no refresh token, no server-side session record, and no revocation. Logout clears the cookie, and a stolen token stays valid for the rest of its week. `docs/TECH_AUDIT.md` raised this in May and it is still open.

**Delivered** in PR #131, behind `auth_sessions`, and the flag is off. `backend/src/auth/sessions.service.ts` mints a family per sign-in and a token shaped `${familyId}.${secret}`, where only the sha256 of the secret is stored. Rotation issues a new secret on every refresh and marks the old one spent; presenting a spent secret revokes the whole family and writes a security alert to the audit log. `sessions.controller.ts` serves `GET /auth/sessions` with device and last-seen and `DELETE /auth/sessions/:id`, both scoped to the caller with no staff bypass, and both answering 404 while the flag is off so a switched-off feature is indistinguishable from one never built. Access tokens drop to fifteen minutes when the flag is on and the refresh token rides in `sbr_refresh`, httpOnly, path `/api/v1/auth`, seven days. Like E5-S1 one PR earlier, a session family is an `AuditLog` row, `entity: "AuthSession"`, so none of this needed a schema change or a migration window on the shared cloud database.

Three things carry forward. Rotation has a ten-second leeway, `REFRESH_REUSE_LEEWAY_MS`, because two tabs waking together present the same token and one loses the race, and with no window that innocent request revokes the family; set it to 0 for strict behaviour. The liveness check on a session id runs whether or not the flag is on, so turning the flag off does not resurrect a session somebody revoked while it was live, and `docs/RUNBOOK.md` §11.4 documents that along with the rest of the rollback. **And the flag has to stay off until the frontend has a refresh client.** Nothing in `src/` calls `POST /auth/refresh`; grep returns no hits. On today's frontend, turning `auth_sessions` on signs every user out fifteen minutes after they sign in, and again every fifteen minutes after that.

Criterion 4 is partly delivered and the difference is worth stating plainly. KYC rejection and staff deactivation each revoke every session the account has open, both tested. Password change and password reset do not, because this API has no password-change endpoint and no reset flow: reset is E5-S3, which has not been built. The revocation call is one line at each site once those routes exist.

**Acceptance criteria**

1. Short-lived access token, 15 minutes or less, with a rotating refresh token.
2. Refresh tokens are stored hashed, rotate on use, and reuse of a spent token revokes the whole family and raises a security alert.
3. `GET /auth/sessions` lists a user's active sessions with device and last-seen, and `DELETE /auth/sessions/:id` revokes one.
4. Password change, password reset, and KYC rejection all revoke every other session.
5. Refresh failure returns 401 with the same shape whether the token is expired, revoked, or fabricated.
6. Behind `auth_sessions` with a documented rollback, since this touches every authenticated request.

---

#### E5-S6, fail closed when `JWT_SECRET` is unset

**Size** S · **Deps** none

**Delivered** in PR #119. `backend/src/config/jwt-secret.ts` holds the guard and the three answers it can give: `missing`, `too-short` and `development-fallback`, each with its own message, and `assertJwtSecret()` is called from `main.ts` beside the other three. The published literal is gone from `auth.module.ts` and `jwt.strategy.ts`; outside production a missing secret now resolves through one named development default, `DEVELOPMENT_JWT_SECRET`, in one place, and deploying that value to production is itself a distinct rejection rather than a value that happens to be long enough. No exit message prints any part of what was configured. `jwt-secret.spec.ts` covers all of it in 28 tests, in production and out.

**Why it exists.** Found while writing the environment matrix in E7-S5. Every other credential in this
application fails closed: `assertSafeDatabaseUrl`, `assertCorsConfigured` and `assertPaymentsConfigured`
each call `process.exit(1)` before Nest starts rather than let a misconfigured instance serve traffic.
`JWT_SECRET` does the opposite.

**Evidence of the gap.** `auth.module.ts:17` signs with `config.get<string>("JWT_SECRET") ?? "dev-secret-change-me"`
and `jwt.strategy.ts:33` verifies against the same expression. With the variable unset the API starts
normally, logs nothing unusual, and signs every seven-day session token with a string that is public in
this repository. Anyone who can read the source can mint a token for any user id, including
`SUPER_ADMIN`, and the forged request is indistinguishable from a real login in the logs. There is no
guard, no test, and no mention of the fallback in any document — `LOCAL_DEVELOPMENT.md:44` and
`VISUAL_QA_AGENT_PROMPT.md:43` both say "min 32 characters", which is advice about a value, not
enforcement of one.

This is the most severe finding of the handover week, and it is severe in a quiet way: the deployment
either has the variable set, in which case nothing is wrong and nothing ever was, or it does not, in
which case every session has been forgeable and nothing in the application would have said so.

**Acceptance criteria**

1. `assertJwtSecret()` in `backend/src/config/`, called from `main.ts` alongside the other three guards,
   exiting non-zero in production when `JWT_SECRET` is unset, empty, shorter than 32 characters, or equal
   to the development fallback.
2. The literal `"dev-secret-change-me"` is deleted from `auth.module.ts` and `jwt.strategy.ts`. Outside
   production a missing secret resolves through one clearly-named development default in a single place.
3. The exit message names the variable and the fix, and never prints any part of the configured value.
4. Specs cover unset, empty, too short, the fallback literal, and a good value, in production and out.
5. The runbook's §7.2 and §9.3 are updated from finding to closed, and `backend/.env.example`'s warning
   comment is replaced by whatever ends up true.

The open question this story carried, whether `JWT_SECRET` was ever actually set in the deployed
environment, is now answered by the deployment itself: a production instance with the variable unset,
empty, short or set to the development default exits non-zero before Nest starts. **If the API is
serving traffic, the secret is set.** That was the point of the story. It does not tell anyone whether
the secret in use today was ever the published fallback, so rotating it once remains cheap insurance.

---

### Epic E6, communications

**Stakeholder value.** Guest buyers are told to keep a Service ID that arrives by email. Email is not configured, so in practice they do not receive it.

---

#### E6-S1, SMTP configuration and delivery observability

**Size** S · **Flag** none · **Deps** EXT-3

**Evidence of the gap.** `backend/src/email/email.service.ts` `dispatch()` logs the message, then returns immediately when `SMTP_HOST` is unset. `backend/.env.example` documents `STAFF_ALERT_EMAIL` and no `SMTP_*` variables at all, so no environment has ever been configured. A send failure is caught and downgraded to a warning. The guest due diligence receipt carrying the Service ID, and the staff alert for a new standalone request, are both silently dropped today.

**Acceptance criteria**

1. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` are documented in `.env.example` and required in production.
2. Startup fails in production when they are missing.
3. Sends are recorded with recipient, template, and outcome, and failures raise an operator-visible alert rather than a warning line.
4. Transient failures retry with backoff. Permanent failures are marked and not retried.
5. `GET /health` reports mail configuration state.
6. A development transport writes to a local inbox so the templates can be reviewed without a provider.

---

#### E6-S2, email channel for notifications

**Size** M · **Flag** `email_notifications` · **Deps** E6-S1

**Evidence of the gap.** `notifications.service.ts` writes rows only. `notification-types.constants.ts` declares the type catalogue and no channel concept. A seller whose listing was rejected finds out only by logging in.

**Acceptance criteria**

1. Each notification type declares its channels: in-app always, email opt-out per type.
2. Users manage preferences in their profile, and security notifications cannot be disabled.
3. Email dispatch is asynchronous and a failure never blocks the in-app notification or the originating transaction.
4. Every email carries an unsubscribe link for non-security types.
5. Behind `email_notifications`, default off until E6-S3 templates land.

---

#### E6-S3, transactional email templates

**Size** M · **Flag** `email_notifications` · **Deps** E6-S2

**Evidence of the gap.** `email.service.ts` builds two templates inline as string concatenation, with user-supplied values interpolated straight into HTML at `buildReceiptHtml` and `sendStaffDdAlert`, which is an injection risk in any client that renders it.

**Acceptance criteria**

1. Templates for at least: welcome and verify, password reset, listing submitted, listing verified, listing rejected, DD paid, DD report ready, PoA executed, escrow held, escrow released, payout sent, KYC verified, KYC rejected.
2. Templates live in files, not in service code, and all interpolation is escaped.
3. Each template renders plain text and HTML from one source.
4. Templates carry the brand, a physical address, and an unsubscribe link where required.
5. A snapshot test per template pins the rendered output.

---

### Epic E7, operability and release readiness

---

#### E7-S1, structured logging and error tracking

**Size** M · **Deps** none

**Evidence of the gap.** No logging, tracing, or error-tracking dependency appears in either `package.json`. The application relies on the default Nest logger. `http-exception.filter.ts` shapes the response and there is no correlation id, no request context, and no error aggregation. A production failure is currently invisible unless someone reads platform logs by hand.

**Acceptance criteria**

1. A correlation id is generated or accepted per request, attached to every log line, and returned in a response header.
2. Logs are structured JSON in production with a consistent field set.
3. An error tracker captures unhandled exceptions with the correlation id, the route, and the role, and never the request body.
4. Passwords, tokens, cookies, account numbers, and document contents are redacted by a filter, with a test that proves it.
5. Payment, escrow, and payout operations emit an explicit start and outcome log with amounts and identifiers.

---

#### E7-S2, coverage thresholds and a CI gate

**Size** S · **Status** ✅ merged, PR #114, on three criteria of four · **Deps** none

**Evidence of the gap.** `backend/jest.config.js` sets `collectCoverageFrom` and no `coverageThreshold`. `vitest.config.ts` configures no coverage at all. `.github/workflows/ci.yml` runs `npm test` without coverage. Nothing prevents coverage from falling.

**Acceptance criteria**

1. ✅ Both suites run with coverage in CI and publish a report artifact.
2. ✅ **Closed by E7-S2b, PR #127.** The repository floor is in: thresholds sit just under the measured numbers in both suites, so coverage cannot fall without failing CI. The strict bar on new and changed files is diff coverage, and neither Jest nor Vitest can express a threshold scoped to changed files. Doing it needs lcov compared against `git diff`, which is a script and a CI step, or a third-party action, which is a dependency decision. Both were beyond an S, so the half that stops decay shipped here and the half that stops accrual was carried as its own row rather than ticked. That row is E7-S2b, and it went the script route: `scripts/diff-coverage.mjs`, no new dependency.
3. ✅ The gate is a required status check on `main`, wired to the existing `ci-gate` job.
4. ✅ **Measured, and the measurement was the finding.** The backend was already measuring all 155 of its files: **41.7%** of statements. The frontend was measuring nothing, and Vitest's default would have reported **48.06%** — computed over the 20 files the tests happen to import, out of 185. Measured the way the backend measures, the whole tree, it is **4.91%**. The floor a ratchet starts from has to be the number over everything, or the ratchet holds a fifth of the repository and reports on the whole of it.

---

#### E7-S2b, diff coverage on new and changed files

**Size** M · **Status** ✅ merged, PR #127, on five criteria of five · **Deps** E7-S2

**Why it exists.** It is criterion 2 of E7-S2 above, split out rather than dropped. E7-S2 put a floor under the repository, which stops coverage falling. This is the strict bar on new and changed code, which is what stops the gap accruing — and at a frontend floor of 4.91% the gap is where nearly all of the risk sits. A floor alone means a new file with no tests passes as long as it does not drag the average below where it already is.

**Evidence of the gap.** `backend/jest.config.js` and `vitest.config.ts` both express `coverageThreshold` globally or per glob, and neither can scope one to the files a pull request touched. Nothing in either runner reads `git diff`.

**Acceptance criteria**

1. ✅ `scripts/diff-coverage.mjs` intersects `git diff --unified=0 <base>...HEAD` with the `DA:` records of the lcov each runner already writes, so only the lines the branch changed are scored. The repository floor is untouched and still lives in the two configs. Which files count is not configured a third time: a file is measured if and only if it appears in the lcov, so the answer is whatever the runner instrumented, and it cannot drift from `include` or `collectCoverageFrom`.
2. ✅ It runs inside `frontend-test` and `backend-check`, both of which already feed `ci-gate`, the single required check on `main`. Failing there fails the pull request. It runs in those jobs rather than a job of its own because the lcov it reads is thirty seconds old at that point, so no artifact plumbing is needed.
3. ✅ Output is per file, with the uncovered line numbers compressed into ranges, then the verdict. Two rules: the 80% bar applies to the diff as a whole, because a percentage over three changed lines is noise, and separately a file with ten or more changed lines that no test reaches fails on its own however well the rest of the diff scores. That second rule is the case this story exists for.
4. ✅ **No dependency and no third-party action.** The rejected alternative was a coverage action such as the several that post diff coverage as a check: less code to own, but a new supply-chain dependency in the required path of every pull request, and this repository has a standing rule against dependencies a story does not name. The script is 200 lines of Node against two formats that are already produced. Stated in PR #127 as the criterion asks.
5. 🔨 **Done in substance, and the honest answer is not the one the criterion assumed.** The mechanism is `npm run coverage:ratchet`: it reads both configs and both summaries and prints what each floor has earned, the measured percentage floored to a whole percent less two points, never below what is already there. Written down in `docs/LOCAL_DEVELOPMENT.md` and beside the numbers in `backend/jest.config.js`. The first turn raised **backend from 40/40/40/41 to 69/49/51/70**, on 41.70% to 71.05% statements. The **frontend floors do not move**, because no frontend test has been written since they were set, so the ratchet has earned nothing there and a floor that has not been earned is decoration. The frontend gap is held by the diff bar instead, which holds the next changed `.tsx` to 80% whatever the floor says.

---

#### E7-S3, end-to-end journeys in CI

**Size** L · **Deps** E7-S2

**Evidence of the gap.** `scripts/` holds six end-to-end scripts including `journey-e2e-all-roles.mjs` and `listing-lifecycle-e2e.mjs`, and `.github/workflows/ci.yml` runs none of them. Playwright is already a dependency and is driven directly by `scripts/e2e-portals.mjs` and `scripts/dd-checklist-e2e.mjs`, with no `playwright.config` and no test runner around it. The scripts also require a live shared cloud database, which is why they cannot run in CI as written. `AGENTS.md` warns never to run `prisma migrate reset` against it.

**Delivered** in PR #132. `.github/actions/ephemeral-api` is the composite action both end-to-end jobs call: it configures the environment, installs, runs `prisma generate` and `prisma migrate deploy` against the Postgres service container the calling job provisioned, seeds it, adds the demo accounts through the API, builds, starts the server and waits for `/api/v1/health/ready`. `scripts/e2e-ci.mjs` is the orchestrator: it declares the five journeys, maps each to the script that proves it, runs them in sequence, tees every line to the console and to a per-journey log under `artifacts/e2e/`, prints a pass or fail table and exits non-zero on any failure. `--list`, `--kind api|browser` and `--only <id>` are how the workflow and a developer select the same subset by the same names.

Three things this needed that the criteria did not mention. `migrate deploy` never `migrate dev`, so the job cannot invent a migration and cannot drop data. `LOG_LEVEL=log`, because `NODE_ENV=test` silences the structured logger and criterion 5 wants a server log worth uploading. And the demo accounts are seeded over a super admin session rather than the admin the script defaults to, since it promotes four users to `ADMIN` and only a super admin may assign that role: against the shared database those four already hold it so the patch never runs, and against a database seeded ninety seconds earlier it is a 403 on the second user.

What this found and did not fix: `backend/scripts/seed-extended-users.mjs` rewrites `docs/DEMO_TEST_ACCOUNTS.csv` from its own list, which omits `superadmin@safebuyrealties.test` and `company@safebuyrealties.test`, so running it locally deletes two rows from a tracked document. It is flagged for DOCS-4.

**Acceptance criteria**

1. ✅ CI provisions an ephemeral Postgres, migrates it, and seeds it. No pipeline touches the shared cloud database. Both jobs declare `services: postgres` and pass its connection string to the composite action; the database is reachable only from the runner and dies with it. `assertSafeDatabaseUrl()` in `backend/src/config/database-guard.ts` is the second lock: outside production the API refuses a non-local `DATABASE_URL` unless `SBR_CONFIRM_CLOUD_DATABASE_URL` is set, and nothing in the pipeline sets it.
2. ✅ Four of the five needed real work rather than a new base URL. `listing-lifecycle-e2e.mjs` now submits licence details and uploads both professional documents when they are missing, because `listPending()` filters on five conditions and a promoted-but-unsubmitted profile is invisible to staff. `guest-checkout-e2e.mjs` read `buyerId`, a field the API has never returned, and recorded the miss as a partial; it is `buyerPublicId` and it is issued at creation. `dd-checklist-e2e.mjs` sent staff to `/login`, which is the portal chooser and carries no form at all, so it sat on a page of four links waiting twenty seconds for `#email`; the staff form is at `/login/admin`, where `e2e-portals.mjs` has always sent them. `SBR_E2E_STRICT=1` turns a partial into a failure and CI sets it, which is fair only because CI seeded the database a minute earlier.
3. ✅ Five journeys, declared in `scripts/e2e-ci.mjs` and listed by `npm run test:e2e-ci -- --list`. Staff verification shares a process with the seller journey because they are one flow, and the entry says so with `provenBy`, rather than splitting the staff half away from the listing it verifies.
4. ✅ Stubbed, chosen explicitly. `PAYSTACK_FORCE_MOCK=true` beside `NODE_ENV=test` is the one combination `backend/src/config/payments-guard.ts` honours, and `isForceMockHonoured()` short-circuits ahead of any key. No `PAYSTACK_SECRET_KEY` of any kind is set anywhere in the workflow.
5. ✅ On failure both jobs upload `artifacts/e2e/`, which holds the server's own `api.log`, a log per journey, and any screenshot a failing browser journey wrote. The directory is gitignored.
6. ✅ Split rather than squeezed. `e2e-api` runs the four API journeys and `e2e-browser` runs the one that drives a browser, so the Playwright download happens beside the API work instead of after it. Both carry `timeout-minutes: 10`, which fails the job rather than letting the pull request path drift past the criterion.

---

#### E7-S4, deterministic demo seed and reset

**Size** M · **Deps** E3-S2

**Evidence of the gap.** QA-015 in `docs/QA_FINDINGS.md` is still open: seeded documents reference `seed/...` storage keys with no files behind them, so seeded listings show placeholders. `src/routes/dashboard.buyer.index.tsx:14`, `listings.$listingId.tsx:32`, and `purchase.$listingId.tsx:48` all fall back to the same Unsplash placeholder. Demos therefore show stock photography instead of the platform's own media.

**Acceptance criteria**

1. The seed uploads real sample files through `StorageService`, so every seeded document resolves.
2. The seed produces listings in every status, including at least one `PENDING_REVIEW` so the staff workflow is exercisable, which was the blocker in `VALIDATION_REPORT.md`.
3. A reset command restores a known demo state on staging and refuses to run against production.
4. `docs/demo-script-checklist.md` is re-validated against the seeded state.

---

#### E7-S5, runbook and environment matrix

**Size** S · **Deps** none

**Acceptance criteria**

1. A runbook covering deploy, rollback, migration, incident triage, and the payment and payout failure paths.
2. An environment matrix listing every variable, whether it is required per environment, and its owner.
3. A secrets checklist naming rotation cadence and holder.
4. `docs/BUILD_CHECKLIST.md` reconciled against this backlog, closing DOCS-1.

**✅ Merged in #117, day 5.** `docs/RUNBOOK.md` is criteria 1 to 3 in one document; criterion 4 was
already discharged by DOCS-1 on day 1 and is verified rather than redone, with the re-audit against
HEAD left to DOCS-4 where it belongs. The story was supposed to write down what is already true, and
writing it down is what found the two things below.

**`JWT_SECRET` has no boot guard**, and falls back to a string committed to this repository. That is
now **E5-S6**, and it is the more serious of the two by some distance. **The container healthcheck
polls the wrong endpoint**, so a container with a dead database passes it — **E7-S6b**. Neither was
fixed here, because a documentation story that edits `auth.module.ts` and the `Dockerfile` is two
stories wearing one PR number.

Three claims in the runbook cannot be settled from this repository and are written as open items
rather than answers: whether `STORAGE_DRIVER` reads `local` in production, whether `JWT_SECRET` is
set there at all, and whether the superseded Vercel backend project is still connected and therefore
still migrating the shared database on every backend push. Each names the exact dashboard to look at.
A runbook that guessed at those and was wrong would be worse than one that says it does not know.

---

#### E7-S6, health and readiness probes

**Size** S · **Deps** none

**Evidence of the gap.** `backend/src/health/health.controller.ts` is a single `@Get()`. It does not check the database, storage, or the payment gateway, so a healthy response can coexist with a broken deployment.

**Acceptance criteria**

1. `/health/live` answers without touching dependencies.
2. `/health/ready` checks database, object storage, and payment gateway configuration, and returns per-dependency state.
3. Neither endpoint leaks versions, keys, or connection strings.
4. Readiness failure marks the instance unavailable rather than serving errors.

**✅ Merged in #101, day 2.** `health.controller.ts:43` is `/health/live` and `:52` is `/health/ready`; the original bare `@Get()` at `:25` stays for anything already pointed at it. Criterion 4 is the one to re-read on Vercel: readiness is a serverless function's answer about itself, and nothing here is an orchestrator that will stop routing traffic to a failing instance. The probes tell a person which dependency is broken, which is what E7-S5's runbook needs; treating them as an automatic remedy would be reading more into them than they do.

---

#### E7-S6b, point the container healthcheck at the readiness probe

**Size** S · **Deps** E7-S6

**Delivered** in PR #120. `backend/Dockerfile:50` polls `/api/v1/health/ready` and exits 1 on anything that is not a 200, so a 503 from a broken dependency now fails the check instead of passing it. `--start-period` is 180s, which covers `prisma migrate deploy` and boot on the shared cloud database rather than only boot. The bare `/health` stays. `backend/src/health/dockerfile-healthcheck.spec.ts` reads the Dockerfile and asserts all of that in 10 tests, so the next edit to that line cannot quietly point it back at an endpoint that answers from static values. `docs/RUNBOOK.md` §2.2 answers criterion 3 by first separating two mechanisms that had been treated as one: the image's `HEALTHCHECK` is what Docker runs, and Render does not run it at all. Render sends its own checks against a **Health Check Path** configured in the dashboard, there is no `render.yaml` here, so nothing in this repository can say what that path is, and with no path set Render's check is a TCP probe that a container with a dead database passes. Where the path is set to `/health/ready`, Render restarts an instance that fails for 60 seconds. The restart cannot fix the dependency, so the probe is a signal rather than a remedy, and §2.2 now says which.

**Why it exists.** Found while writing the deploy section in E7-S5. E7-S6 built `/health/ready` so that
a broken dependency is visible; the one automated consumer of a health endpoint in this repository was
never pointed at it.

**Evidence of the gap.** `backend/Dockerfile`'s `HEALTHCHECK` polls `/api/v1/health`, the original bare
`@Get()` at `health.controller.ts:25`, which returns 200 from static values and touches nothing. **A
container whose database is unreachable therefore reports itself healthy.** That is the exact failure
E7-S6 was written to make visible, on the one path that could act on it.

**Acceptance criteria**

1. The `HEALTHCHECK` polls `/api/v1/health/ready` and treats 503 as unhealthy.
2. The `--start-period` accommodates `prisma migrate deploy` plus boot, since the container migrates
   before it serves and readiness cannot pass until it does.
3. What Render actually does with an unhealthy container is written into `docs/RUNBOOK.md` §2.2 — if it
   only restarts, the probe is a signal rather than a remedy and the runbook should say which.
4. The bare `/health` endpoint stays, since other things may already poll it.

Small, but it is a deploy-path change and wants its own verification rather than a ride on a docs PR.

---

### Epic E8, compliance and go-live

---

#### E8-S1, NDPR consent, retention, and erasure

**Size** L · **Flag** `privacy_centre` · **Deps** E5-S5, EXT-5

**Evidence of the gap.** No consent model, no retention policy, and no erasure path exist in the schema or the codebase. The platform stores government identity documents, selfies, and professional credentials. The reference project treats the equivalent as `FR-A6` and `FR-A7` with a dedicated privacy centre, and its own `docs/adr/0004-auth-and-account-portal.md` is worth reading before designing this.

**Acceptance criteria**

1. Consent is captured at registration with version, timestamp, and source address, and no account exists without a consent row.
2. A published privacy notice is versioned, and a material change re-prompts.
3. Retention periods are declared per data category and enforced by a scheduled sweep, with KYC documents and audit logs given explicit, separately justified periods.
4. Data export returns a user's own data on request.
5. Erasure honours a grace period, blocks deletion where a legal hold applies such as an executed PoA, and crypto-shreds rather than orphaning storage objects.
6. Every privacy action is audited.

---

#### E8-S2, legal review of the PoA instrument and terms

**Size** S · **Status** ⛔ blocked on EXT-4 · **Deps** external

**Evidence of the gap.** `backend/src/poa/poa.service.ts` generates an instrument whose clauses were written in the build checklist, not by counsel. The consent copy in `src/components/PoAExecutionScreen.tsx` includes an irrevocability acknowledgement. The client is a firm of lawyers, and `docs/inputs/client-legal-comments.docx` already asks for a security review.

**Acceptance criteria**

1. Counsel-approved instrument text replaces the current draft, and the version is recorded on every executed record.
2. Terms of service and the privacy notice are approved and versioned.
3. Executed instruments retain the text version in force at execution, so a later revision does not rewrite history.
4. The witnessing and Land Registry registration expectations in the current consent copy are confirmed or corrected by counsel.

---

#### E8-S3, pre-launch security review

**Size** S to schedule, variable to remediate · **Status** ⛔ blocked on EXT-6 · **Deps** E4-S3

**Acceptance criteria**

1. An independent review covering authentication, authorization, payments, and document handling.
2. Every high and critical finding is fixed with a regression test, not suppressed.
3. Medium findings are either fixed or tracked with an owner and an SLA, following the ratchet pattern in the reference project's ADR-0013.
4. A re-test confirms closure before G5.

---

#### E8-S4, public web surface

**Size** M · **Deps** none

**Evidence of the gap.** There is no `public/` directory in the repository, so there is no `robots.txt`, no `sitemap.xml`, and no favicon set. Public routes do not set per-route titles, descriptions, canonicals, or structured data. For a property marketplace, organic discovery of listing pages is a primary acquisition channel.

**Delivered** in PR #130, and the part worth reading is what proving it turned up rather than what it built. `src/lib/seo.ts` holds one metadata builder that every public route calls, so a title, description, canonical and Open Graph set exists per route and per listing in one place instead of six. `src/routes/robots[.]txt.ts` and `src/routes/sitemap[.]xml.ts` are generated per request from the anonymous listings API, and both read the host that asked, so a preview origin serves a disallow-all robots file and a listing-free sitemap without any configuration. Listing detail carries `RealEstateListing` JSON-LD. Private routes are `noindex` in the document and in an `X-Robots-Tag` header both, because the header is the half that still applies when a crawler never parses the body. Nothing new was added to `package.json` beyond the measurement script.

Criterion 3 is the one that mattered. `SITEMAP_PAGE_SIZE` was 200 and `ListListingsQueryDto` caps `pageSize` at 100, so every page request came back 400, and `fetchSitemapListings` treats a refusal as an empty catalogue on purpose. The route answered 200, the XML was well formed, the unit tests were green, and the sitemap advertised zero properties. Only fetching the served document and reconciling it against the API said so. The constant is 100, its docblock names the DTO that caps it, and six tests for `fetchSitemapListings` exist where there had been none, led by one that fails if the number is raised again. Criterion 5 was swept over every route the generator emits rather than a typed list: 37 private routes `noindex` in both places, 7 public routes indexable, 0 wrong. Criterion 6 was measured on the deployed listing page over 7 runs per profile, throttled, and it is a baseline of the site as it stands rather than of this PR's rendering: mobile LCP 3776 ms, CLS 0.000, TBT 0 ms, FCP 1084 ms, TTFB 255 ms, 418 KB; desktop LCP 1096 ms, CLS 0.000, TBT 0 ms, FCP 528 ms, TTFB 265 ms. Mobile LCP is the only metric outside good, and it is an image-weight problem rather than a script one, which is why TBT is flat zero.

Two findings came out of the proof and are written up rather than fixed here, because both are wider than a metadata story. `securityHeadersMiddleware` in `src/start.ts` does not run on a 404 or a router redirect, so production answers `/dashboard` and any invented path with no Content-Security-Policy, no X-Frame-Options and no Referrer-Policy. And the frontend and backend disagree about what makes a listing public: `isPubliclyVisible` in the backend serves `LIVE` whatever `isPublished` says, `listingIsPubliclyViewable` in the frontend refuses anything with `isPublished` false, and all 7 live listings are exactly that. The sitemap is correct today because the backend is the side that answers. One setting belongs to a stakeholder: `VITE_SITE_URL` must be set on the production Vercel project, left unset on previews, and must name the same origin as the backend's `POA_VERIFY_BASE_URL`, because a printed QR code encodes that host and a mismatch prints a dead link onto paper.

**Acceptance criteria**

1. Public routes are server rendered with content in the initial HTML, verified by fetching with JavaScript disabled.
2. Unique title, description, canonical, and Open Graph tags per public route, including each listing.
3. `robots.txt` and a generated `sitemap.xml` covering live listings only.
4. `RealEstateListing` JSON-LD on listing detail pages.
5. Every dashboard and private route is `noindex`.
6. Core Web Vitals measured on the listing detail page and recorded as a baseline.

---

## 5. Cross-cutting definition of done

Every story above is done when all of the following hold. This is the reference project's `rules.md` §1, ratcheted to new and touched code.

1. One story, one pull request, single purpose, conventional-commit title, squash merged.
2. Behind its declared feature flag where one is given, with the flag defaulting off and a documented kill switch. CH-1 built the mechanism, so this is now enforceable rather than aspirational: declare the key in `backend/src/feature-flags/feature-flags.constants.ts`, gate the route with `@RequiresFeature`, gate the control with `<Feature>`, and the kill switch comes with it.
3. No unhandled 5xx. Every failure maps to the correct 4xx or a deliberate 502 with a correlation id.
4. Structured logs on every new endpoint or job, carrying the correlation id, never PII, secrets, documents, or account numbers.
5. Tests cover the happy path and every rejected path. New and changed files clear the diff bar, which is 80% of the lines the branch changed, enforced by `scripts/diff-coverage.mjs` inside `frontend-test` and `backend-check`. It is no longer on the author's honour: CI fails and names the uncovered lines. If a diff genuinely cannot be covered, say so with `diff-coverage-exception: <reason>` in the description.
6. Input validated on client and server against the same rules. Validation failures return 4xx with a machine-readable code.
7. Authorization is server side and fail closed. Hiding a control in the UI is never the control.
8. Docs updated in the same pull request: `docs/BUILD_CHECKLIST.md`, `README.md` where behaviour changed, and an ADR when a real decision was made.
9. `npm run validate:tsc`, `npm test`, `cd backend && npm test`, and `npx eslint src --max-warnings 0` all clean, with no warnings suppressed to get there.
10. Root cause fixed, with a regression test. No band-aid, no suppression, no disabled test.

---

## 6. Suggested sequencing

**One developer, about 14 to 19 weeks.** Follow the critical path in section 3.1, and use the unblocked quick wins as filler while waiting on external inputs.

**Two developers, about 8 to 10 weeks.**

- Developer A owns the loop and the money: E1 in full, then E2, then E4-S2 and E2-S5.
- Developer B owns trust, access, and platform: E3 in full, then E4-S1 and E4-S3, then E5, E6, E7.
- They meet at E7-S3, which needs both halves working, and at the go-live gates.
- The only hard cross-dependency is E1-S3 needing E3-S1, so B should land E3-S1 in week one.

**First week, whoever is on shift.** DOCS-1, E2-S4, E5-S2, E6-S1, E3-S4. Five small stories, about four days, and between them they close the worst silent-failure mode in the money path, the credential-reflecting CORS policy, the silently dropped email, and the QR code that has always pointed at a 404.

> **Reconciled 2026-07-31.** The handover week ran this first week and landed four of the five: DOCS-1, E2-S4 (#99), E5-S2 (#97, tightened by E5-S2a #102) and E3-S4 (#98). **E6-S1 is the one that did not**, and it did not because it needs a mail domain the client owns, which is EXT-3 and still outstanding — so the silently dropped email is the one item from this paragraph the next team inherits, and it is waiting on someone outside the repository rather than on a developer. The week also closed **E3-S1**, which is the two-developer plan's only hard cross-dependency and its week-one instruction for developer B: that constraint is now discharged, so B can start anywhere in E3 to E7 and A is no longer gated at E1-S3. What replaces it as the earliest scheduling decision is **E3-S2**, durable object storage, which is still on the critical path and still waits on ADR-0004.

---

## 7. What this backlog does not cover

Deliberately out of scope for MVP, carried forward as a Phase 2 statement of work, consistent with the bucketing in `docs/analysis/05_STRATEGIC_RECOMMENDATIONS.md` §1.3 and §1.4:

Agent and broker role with leads, offers, and commission. In-app messaging and case chat. Support ticketing. Seller, agent, and business analytics beyond the finance reconciliation in E2-S5. Saved searches and map-based discovery. Professional earnings and fee disbursement. Flutterwave as a second gateway, noting that `PlatformConfig.flutterwaveEnabled` exists in the schema with no adapter behind it. Two-factor authentication for staff and admin. Build-phase professional orchestration. AI document verification and fraud indicators. A mobile field application.

Each is cleanly extractable from the current architecture, which is the strongest thing this codebase has going for it.
