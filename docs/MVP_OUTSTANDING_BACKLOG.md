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
| **M1 Close the loop** | A buyer can complete a purchase on-platform, end to end | E1 (4) | 11 to 14 days | E1-S1, E1-S2, E1-S4, E1-S3 | none, the epic is closed |
| **M2 Money integrity** | Real sellers get paid, real refunds are repaid, no double processing | E2 (5) | 12 to 15 days | E2-S4, E2-S2 | 3 stories, 9 to 11 days |
| **M3 Document trust** | Private documents stay private and survive deployment | E3 (4) | 7 to 10 days | E3-S1, E3-S4 | 2 stories, 4 to 7 days |
| **M4 Access correctness** | Privileges are enforced by the API, not only by the menu | E4 (3) | 6 to 9 days | E4-S1, E4-S3, E4-S2 | none, the epic is closed |
| **M5 Account security** | Rate limits, real sessions, password reset, verified email | E5 (5) | 11 to 15 days | E5-S2, and E5-S2a on top of it; E5-S6 found and merged; E5-S1; E5-S5, shipped with its flag off | 2 stories, 3 to 6 days |
| **M6 Communications** | Email actually leaves the building | E6 (3) | 5 to 7 days | none | 3 stories, 5 to 7 days |
| **M7 Operability** | Failures are visible, regressions are caught before merge | E7 (6) | 10 to 14 days | E7-S2, E7-S6, E7-S5, E7-S1, E7-S3; E7-S2b and E7-S6b found, both merged | 1 story, 2 to 4 days |
| **M8 Go-live compliance** | NDPR, legal review, security review, public web surface | E8 (4) | 8 to 12 days plus external lead time | E8-S4 | 3 stories, 5 to 9 days plus external lead time |
| **M9 Financial governance** | Every naira the platform touches is coded, ring-fenced and reconcilable | E9 (4) | 11 to 19 days | E9-S1 | 3 stories, 9 to 15 days |

**M9 is the one row here whose Estimate was not struck before the handover week**, because the work did not exist then. It arrived with SBR-FIN-DEV-SPEC-20260803-V1.5, approved for implementation by the CFO and relayed on 2026-08-05, and it is sized on the same key as everything above it rather than on a separate one. Saying that in the table would have been tidier and less true: the column means "the figure this milestone was first scoped at", and for M9 that figure is five days old.

It was 34 milestone stories plus two chores (DOCS-1 and CH-1, about 4 days), 36 in all, roughly 72 to 100 developer-days. Twenty-three milestone stories and every chore have merged, and three more stories were discovered inside them (E7-S2b inside E7-S2, E5-S6 and E7-S6b inside E7-S5). DOCS-4 was a fourth chore the week added to itself, and with it in there is no chore left. All four of **E1** have merged, which is the whole of the engineering the ADR-0001 answer released, and all three of **E4** with them, so two epics are closed and 14 of the original stories remain, 28 to 44 days. **M9 then adds four stories that were not in the original 34 at all**, one of which merges with this document, so **17 milestone stories, roughly 37 to 59 developer-days remain.** This is the first time the total has gone up by more than a story found inside another one, and it should be read as new scope rather than as a slipped estimate: the specification that created E9 was approved on 2026-08-03 and reached engineering on 2026-08-05, six days after this backlog was written. Each merged story is subtracted at its published size rather than re-estimated, which is the same arithmetic `docs/mvp-board.html` shows on its Full backlog tile. One developer lands what is left in about 6 to 11 calendar weeks. Two developers working the split in section 6 land it in about 4 to 7 weeks, because M1 and M3 parallelise cleanly and M2 depends on M1 only at the final story. One developer running many agents in parallel, with a second reviewing, lands it a good deal faster than either: the board has the evidence from the handover week.

**The floor above used to be 32, DOCS-4 settled it at 41, E1-S1 merging took it to 36, E1-S2 and E1-S4 took it to 32 again, E1-S3 and E4-S2 have taken it to 28, and E9 arriving has put it up to 37, all by a route that can be checked.** Worth recording how it drifted, because the mechanism matters more than the ten days. The **Remaining** column subtracts each merged story from that milestone's own range, and its ceilings have always agreed exactly with the per-epic bars on `docs/mvp-board.html`, because a check on the board derives the tile's ceiling from those bars and fails the build when the two disagree. The floor had no such check. It was kept by hand as a single running subtraction against the pre-week 72, so every merge asked somebody to remember a number rather than to add up a column, and by this week it sat ten days below what the eight milestone rows came to, counting the chore day that was still open on both sides of the comparison. Nobody made an error; nothing was ever going to catch one. The rows are the source, with the chore merged they added up to 41, with E1-S1 merged they added up to 36, with E1-S2 and E1-S4 merged 32, with E1-S3 and E4-S2 merged 28, and with **M9** on the table they add up to 37, which is the figure in both places. Each effort bar on the board carries a floor beside its ceiling, the Full backlog tile sums both ends from those bars, and `npm run validate:board` fails if either drifts again. That check is what makes the E9 addition safe to make in one sitting: a new bar that did not agree with the tile would fail the build rather than sit there reading plausibly. Plan against the ceiling, as before. The difference is that the floor is now checkable rather than remembered.

**A week of merging bought four days off the floor and two off the ceiling, and found three stories doing it.** That is the shape of the week rather than a mis-estimate. What shipped was landmine work: of the seven milestone stories, six were S, and the one M turned into six sub-stories. M7 went from 10-to-14 up to 10-to-16 because measuring the coverage floor found the half of the criterion a floor cannot express, which is now E7-S2b. M5 went up by a day because writing the environment matrix found the one credential in this application that does not fail closed, which is now E5-S6. An audit week that reveals work is an audit week doing its job, and an estimate that moves when it does is the estimate doing the same.

**The week discovered four stories — E5-S2a, E7-S2b, E5-S6 and E7-S6b — and half of them came out of a documentation story that shipped no code.** Worth noticing before the next team decides documentation is the part to skip. Nothing was found by reading a story's title; it was found by reading the code the title described and writing down what it actually did.

**Demo-safe subset.** If the near-term need is a credible client demo rather than a public launch, M1 plus what is left of M3 is enough, roughly 10 to 16 days, down from 22 to 28 because E2-S4, E2-S2, the document authorization half of M3 and now E1-S1 have all landed. That subset used to name E2-S2 as well; it merged in wave 1 and now costs nothing, and DOCS-4 corrected the total here at the same time as the floor above, since both were being carried by hand. That produces a complete buyer journey with private documents and no way to accidentally show a fake payout as real. It is not enough to invite real users onto real naira.

### 1.4 Decisions, two answered and three open

These are product and commercial decisions. **D1 came back answered on 2026-08-02 and D2 on 2026-08-05.** Three are open, and one of those three is now blocked on an answer of its own rather than merely undecided: D4 cannot be taken until counsel says which of two contradictory data-transfer rules governs, because the two produce different bucket regions. M1 is finished, M2's largest story is released by D2 and held only by an external account, and M3 still cannot start.

| # | Decision | Why it blocks | Recommendation | Status |
| --- | --- | --- | --- | --- |
| D1 | Is the on-platform property purchase in the MVP, or is standalone due diligence the MVP? | Two due diligence paths exist and only one is complete. Answering "standalone only" removes most of E1 and E2 and cuts about 20 days | Confirm on-platform is in scope, since escrow and PoA only pay off there. If it is not, retire the wizard rather than leaving it half-wired | ✅ **Answered 2026-08-02: on-platform purchase is in the MVP.** The recommendation was taken. `docs/adr/0001-mvp-scope-envelope.md` is Accepted, E1's four stories are startable, and they are wave 4 on the board |
| D2 | Escrow money model and the settlement account | Whether SafeBuyRealties holds client funds changes the CBN and AML posture, and changes E2-S1 from a bank-details form into a regulated flow | Legal and compliance review before E2-S1 starts | ✅ **Answered 2026-08-05: SafeBuyRealties holds client funds.** SBR-FIN-DEV-SPEC-20260803-V1.5 §11.1 obliges the platform to reconcile an escrow bank balance, which only its operator can be asked to do, and §1.3 and §11.3 make that balance a liability rather than income. `docs/adr/0002-escrow-fund-holding-model.md` is Accepted. E2-S1 is a regulated flow, and it now waits on EXT-1 alone. **Approval to build is not approval to operate:** §14.2 withholds production activation, which is a second gate |
| D3 | KYC: manual review or a provider such as Smile ID or VerifyMe | Manual is built. A provider changes E4-S2 and adds vendor lead time | Ship manual for MVP, keep the provider seam | ⏳ Open, and cheaper to answer late than it was. E4-S2 (#142) shipped on manual review and reads one field, `KycRecord.status`, through one registry. A provider changes who writes that field, not who reads it |
| D4 | Object storage provider and region | Blocks E3-S2, which is on the critical path | S3-compatible, decide region for NDPR data residency | ⏳ Open, and **unblocked on 2026-08-06**. It was blocked from 2026-08-05, because the region half could not be decided until EXT-11 came back: the client's internal data protection policy §12 forbids transfer outside Nigeria except on a closed list of three conditions, while the published privacy policy §10 promises only "reasonable steps". Those two rules produce different buckets, and the platform already runs on non-Nigerian infrastructure. **The completed EXT-11 answer withdraws the deferral.** The internal policy governs, the closed list wins, and the approved mechanism for non-Nigerian infrastructure is an NDPC-approved Cross-Border Data Transfer Instrument or standard contractual clauses with the hosting provider and the subprocessors. This row is now a choice between two answers rather than a wait: a **Nigerian region**, which needs no instrument, or a **non-Nigerian region**, which cannot carry production data until that instrument is executed. No such executed instrument exists in this repository. Takeable is not taken, and the choice is asked for at EXT-2 rather than a second time here |
| D5 | Adopt the reference project's quality bar as a ratchet on new code | Sets the definition of done for every story below | Yes, ratchet only, per section 0.3 | ⏳ Open |

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
| `docs/SafeBuy_Financial_Governance_Developer_Implementation_Specification_v1.5_Core_Accounts_Escrow_IDs.docx` | ⚠️ Client source, authoritative, E9-S1 | SBR-FIN-DEV-SPEC-20260803-V1.5, sha256 `49978541698407936fce29e489070dc22fd7fd76e22293084ab3e816f6a22f75`. Approved by the CFO for implementation and **not** for production activation, per its own §14.2. Where this specification and any story brief disagree, the specification wins |
| `docs/SafeBuy Realties ID Standard.docx` | ⚠️ Client source, authoritative, **and it contradicts itself** | sha256 `42c78808dd768a93b97b82356918a321ab800d89fd80084f157e6fe5f7ca80c0`, tracked since 2026-06-16. §2.0 rule 6 implies the national register throughout, §3.0 and §4.0 give Lagos examples, §7.0 gives national ones. That is EXT-8's fourth conflict, and it is why E9-S2 implements the property register only. The lock file beside it has an explanation as of 2026-08-06: management confirmed the document is under controlled revision and **Version 2 is due 2026-08-13**. The 2026-08-06 EXT-8 answer splits the registers by family rather than changing the code values, so this copy is superseded on content and not on data. Treat it as the current authority until Version 2 arrives, re-check the hash before relying on it, and encode no disputed rule permanently in the meantime |
| `docs/inputs/SBR TERMS AND CONDITIONS SAFEBUY.docx` | ⚠️ Client source, **incomplete** | The file stops at §10, Intellectual Property, and ends mid-clause. Nine clause families a platform holding client money needs are absent; the table under EXT-4 in section 3.3 lists them. §10 also vests site content in an individual rather than the company. Do not quote this document as the platform's terms |
| `docs/inputs/SBR -POWER OF ATTORNEY.docx` | ⚠️ Client source, complete instrument, **narrower than the code assumes** | Clause 5 authorises a 10% deduction at source for brokerage and says nothing about VAT, which is the withholding FinGov §4 and Appendix C both perform. The body is dated 2017 in two places and carries no attestation, stamping, registration or Governor's consent clause. **The 2026-08-06 EXT-10 answer resolves the VAT half in this document's favour**: "VAT must not be withheld from the seller's property-sale proceeds", and the Appendix C worked example is unauthorised as written. That ruling is headed "recommended counsel position for formal signature" and counsel has not signed it, so the instrument itself is unchanged. Clause 5 also authorises deduction from the seller only, which is why the two-sided commission EXT-9 confirmed needs a buyer-facing instrument that does not exist. EXT-10 and EXT-4 |
| `docs/inputs/SB DATA PROTECTION POLICY.docx` | ⚠️ Client source, **"SUBJECT TO BOARD APPROVAL"** | Its own first line. Stricter than the published privacy policy on cross-border transfer, and it names no DPO. Its §9 DPCO engagement, §10.1 fifteen-month audit, §13 DPIA and §14 RoPA are now in E8-S1's scope, and the 2026-08-06 EXT-11 answer adds §7.1's SNAG and §6.2's higher-standard consent tier for sensitive data. Legal's reply cites this copy section by section and the wording matches, so it is the current one. EXT-11 |
| `docs/inputs/SBR PRIVACY POLICY.docx` | ⚠️ Client source, **published, and weaker than the internal policy** | §10 promises "reasonable steps" where the internal policy's §12 sets a closed list of three conditions. It also treats browser settings as cookie consent and continued browsing as consent. **All three of those are overridden as of the 2026-08-06 EXT-11 answer**: the statute governs, so the closed list is the transfer rule, and §6's bar on consent by inactivity disposes of both consent practices. **This document now needs rewriting**, and as of the second EXT-11 answer the same day that is an instruction in the client's own words rather than this project's inference: "where the published Privacy Policy conflicts, it must be amended to match the stricter internal policy and governing law", with the amended policy effective at platform go-live. It is a client action rather than an engineering one and belongs with EXT-5 |

**First housekeeping action, before any story:** reconcile `BUILD_CHECKLIST.md` against this document, and mark the stale analysis files with a header that points here. In the reference project's paradigm this is a `DOCS-1` chore, size S, and it is worth doing because the checklist is what every AI agent on this repo reads first.

> **Done, 2026-07-29, and the reason it was first still holds.** DOCS-1 reconciled the checklist and DOCS-2 bannered six documents, all six pointing at `HANDOVER.md` for current state and here for current gaps. What the row above cannot say is what the reconcile cost: the checklist had been `[x]` on the listing DD lifecycle for long enough that two later documents inherited the claim. The banners are deliberately loud and deliberately non-destructive. Nothing was deleted, because a stale document is evidence of what was believed and when, and the only thing wrong with it is a reader who cannot tell.
>
> **Finished, 2026-08-02, by DOCS-4.** Six documents had been missed. Three were agent-facing, two prompt packs that read as live instructions and a demo walkthrough that is still correct but no longer complete, and that is the worse half of the problem: a stale audit misleads a reader, a stale prompt misleads a worker. One was `PRD.md`, the original one-page brief, still sitting in `docs/` under a name that invites a reader to treat it as the requirements. The last two, `01_SOURCE_SYNTHESIS.md` and `02_MASTER_PRD.md`, are not stale at all, and the reason to banner them is the same reason in reverse: three of the five analysis files carried a warning and two did not, so silence could mean current or could mean unchecked and a reader had no way to tell.
>
> **Six client source documents added, 2026-08-05.** They are the bottom six rows and they are a different kind of entry from everything above them. A `.docx` cannot carry a banner, and nobody on this side may edit a document the client owns, so **this table is the only place a reader can be warned** that the terms of service file is unfinished or that the data protection policy is unapproved. Each row therefore says what is wrong with the document rather than what is stale about it, and every finding points at the external item that resolves it. The five new files were committed with E9-S1; the ID Standard has been tracked since June and only its warning is new.
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
| E1-S1 🔴 | Loop | Listing DD case lifecycle: queue, assign, report, complete | `dd_case_lifecycle` | L | ✅ #138, flag off | none, D1 answered |
| E1-S2 🔴 | Loop | Transaction state machine, DD_PURCHASED to DD_COMPLETE | `dd_case_lifecycle` | M | ✅ #139, flag off | E1-S1 |
| E1-S3 🔴 | Loop | Buyer DD report delivery, access controlled | `dd_case_lifecycle` | M | ✅ #141, flag off | E1-S1, E3-S1 |
| E1-S4 🔴 | Loop | Property purchase step wired to the state machine | `property_purchase` | M | ✅ #140, flag off | E1-S2 |
| E2-S1 🔴 | Money | Seller payout destination, per-seller bank account | `payouts` | L | ⛔ | D2, EXT-1 |
| E2-S2 🔴 | Money | Webhook idempotency, replay and freshness guard | — | M | ✅ #123 | none |
| E2-S3 | Money | Gateway refunds, not ledger-only | `payouts` | M | 📋 | E2-S1 |
| E2-S4 🔴 | Money | Production guard on payment mock mode | — | S | ✅ #99 | none |
| E2-S5 | Money | Finance reconciliation view | — | M | 📋 | E2-S1 |
| E3-S1 🔴 | Trust | Authorized document access, retire the public static route | `secure_docs` | M | ✅ #103–112, six sub-stories | none |
| E3-S2 🔴 | Trust | Durable object storage in production | — | M | ⛔ | D4, EXT-2 |
| E3-S3 | Trust | Upload hardening: type allow-list, magic bytes, AV hook | `secure_docs` | M | 📋 | E3-S2 |
| E3-S4 | Trust | Public PoA verification page | — | S | ✅ #98 | none |
| E4-S1 🔴 | Access | Enforce PermissionsGuard on every privileged endpoint | — | M | ✅ #121 | none |
| E4-S2 | Access | KYC gate on money-moving actions | `kyc_gate` | M | ✅ #142, flag off, criterion 4 deferred to E2-S1 | D3 |
| E4-S3 | Access | Cross-role authorization test suite | — | M | ✅ #125 | E4-S1 |
| E5-S1 🔴 | Security | Rate limiting and lockout on auth and payments | — | M | ✅ #129 | none |
| E5-S2 🔴 | Security | CORS allow-list from configuration | — | S | ✅ #97, tightened by E5-S2a #102 | none |
| E5-S3 | Security | Password reset | `auth_recovery` | M | 📋 | E6-S1 |
| E5-S4 | Security | Email verification on self-registration | `auth_signup` | M | 📋 | E6-S1 |
| E5-S5 | Security | Session management: refresh rotation and revocation | `auth_sessions` | L | ✅ #131, flag off until a client refreshes | none |
| E5-S6 🔴 | Security | Fail closed when `JWT_SECRET` is unset | — | S | ✅ #119 | none |
| E6-S1 🔴 | Comms | SMTP configuration and delivery observability | — | S | ⛔ | EXT-3 |
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
| E8-S1 | Compliance | NDPR consent, retention, and erasure | `privacy_centre` | L | ⛔ | EXT-5 |
| E8-S2 | Compliance | Legal review of the PoA instrument and terms | — | S | ⛔ | EXT-4 |
| E8-S3 | Compliance | Pre-launch security review | — | S | ⛔ | EXT-6 |
| E8-S4 | Compliance | Public web surface: robots, sitemap, per-route metadata | — | M | ✅ #130 | none |
| E9-S1 | FinGov | Chart-of-accounts and ID-register tables, no rates and no postings | `financial_governance` | M | ✅ this PR, flag off | none |
| E9-S2 | FinGov | Location register and property ID issuance against the standard | `financial_governance` | M | ⛔ | E9-S1, EXT-8, ID Standard Version 2 due 2026-08-13 |
| E9-S3 | FinGov | Six main accounts, sub-codes, commission and VAT rates, postings | `financial_governance` | L | ⛔ | E9-S1, EXT-9, EXT-10 |
| E9-S4 | FinGov | Escrow sub-ledger and the section 11.1 reconciliation | `financial_governance` | M | 📋 | E9-S3, E2-S1 |

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
>
> **Reconciled 2026-08-03.** `E1-S1` has merged as #138, so the path now starts at `E1-S2`. The graph puts `E3-S2` in front of `E1-S1` and that edge turned out not to bind: reports go through the existing `StorageService` seam, so whichever provider D4 picks is a change behind that seam and not a change to the case lifecycle. `E3-S2` still gates going live with real documents. It did not gate building the lifecycle that files them.
>
> **Reconciled again on 2026-08-03, later the same day.** `E1-S2` has merged as #139, so the path now forks rather than continues: `E1-S3` and `E1-S4` are both free, they do not depend on each other, and they can be taken in either order or together. The next single point on the path is `E2-S1`, which waits on `E1-S4` and on ADR-0002, so getting `E1-S4` in is what turns that decision from a queue position into a start.
>
> **Reconciled a third time on 2026-08-03.** `E1-S4` has merged as #140, and it was the last dependency any row in this document had on the E1 chain. `E2-S1` now waits on ADR-0002 alone, so answering that decision starts the work rather than buying a queue position, and it is the largest single answer left. `E4-S2`, the KYC gate, listed `E1-S4` as its only story dependency and is startable now; D3 shapes it rather than blocking it, because manual review is what ships. What is left of the critical path is `E1-S3`, which stands on its own rather than in front of anything, then `E2-S1` when ADR-0002 comes back.
>
> **Reconciled a fourth time on 2026-08-03.** `E1-S3` has merged as #141, so every box in the graph above except `E3-S2` and `E2-S1` is closed, and the E1 chain is finished end to end: a listing case is opened, worked, signed off, paid for into escrow, and the report is delivered to the buyer who paid for it. Nothing on the critical path is startable by a developer today. `E2-S1` waits on ADR-0002 and `E3-S2` waits on ADR-0004 and EXT-2, so the path now moves when a stakeholder answers and not before. The one row left on the schedule, `E4-S2`, is off the path rather than on it.
>
> **Reconciled a fifth time on 2026-08-04.** `E4-S2` has merged as #142, and with it the schedule is empty: every remaining story in this document waits on a decision, an external party or a story that does. The reconcile worth recording is not that one, it is what E4-S2 could not finish. Its fourth acceptance criterion says a seller needs verified KYC before a payout account can be verified, and there is no payout destination in this codebase to gate. `E2-S1` builds one and waits on ADR-0002, so the action is declared in `KYC_GATED_ACTIONS` as `SELLER_PAYOUT_ACCOUNT` with `story: "E2-S1"` on it and reaches no request. That is one line for whoever takes `E2-S1` rather than a rediscovery: call `assertKycGate` on the way into the verify step and the criterion is met. `E2-S1` now carries two things ADR-0002 releases, its own scope and somebody else's criterion.
>
> **Reconciled a sixth time on 2026-08-04.** No story merged into this note. Re-deriving the remaining-work report against the board turned up seven rows in the table above whose dependency column had quietly gone false, and this is the correction. Four of them still named a story that has already merged: `E2-S5` waited on `E4-S1`, which merged as #121; `E8-S1` waited on `E5-S5`, which merged as #131; `E8-S3` waited on `E4-S3`, which merged as #125; and `E2-S1` waited on `E1-S4`, which merged as #140. Two more named a dependency that was not written down anywhere a reader could act on it, `E8-S2` and `E8-S3` both reading `external`, and one, `E6-S1`, read `none` while the story body had already said it waits on SMTP credentials. Every one of them now names the external item that actually holds it: EXT-1 the merchant and settlement accounts, EXT-2 the object-storage bucket, EXT-3 the SMTP credentials, EXT-4 counsel, EXT-5 the DPO registration, EXT-6 the security reviewer. What changes for whoever picks up the queue is the count of rows a developer can start alone, which reads as zero and is zero, rather than four rows that looked startable because the story in front of them had shipped and nobody had gone back to the column.
>
> **Reconciled a seventh time on 2026-08-05.** Two things moved and neither of them is a story finishing. **ADR-0002 is answered**, so `E2-S1` no longer waits on a decision at all: it waits on EXT-1, and EXT-1 is now a larger ask than it was, because the answer is that SafeBuyRealties holds client funds and the account it needs is a ring-fenced client-funds account rather than a merchant settlement account. The graph above is unchanged in shape and one of its two remaining boxes changed owner, from the stakeholder who had to decide to the client who has to open an account. **And a new epic arrived that is not on this path.** `E9` implements SBR-FIN-DEV-SPEC-20260803-V1.5 and it is deliberately drawn off the critical path: its first story ships tables and no behaviour, everything in it sits behind `financial_governance` with the flag off, and section 14.2 of the specification withholds production activation as a second gate that this project does not hold. So E9 lengthens the backlog without lengthening the path to a launchable product, which is the honest way to read the total going from 28 days to 37. The one edge E9 does have into the path is at the far end: `E9-S4` reconciles an escrow bank balance and cannot be finished without the account `E2-S1` needs, so EXT-1 now blocks two epics rather than one.
>
> **Reconciled an eighth time on 2026-08-06.** No story merged into this note either. **EXT-11 came back from Legal on the day it went out, and it is the first of the five to answer.** It answered two of its three questions and the graph above is unchanged, which is the part worth stating plainly: `E3-S2` still waits on ADR-0004 and EXT-2, and the region choice inside it still waits on EXT-11, because the question that was holding the region is the one that was not answered. What did change is the character of two rows rather than their status. `D4` is blocked for a narrower reason than it was: the two documents no longer disagree, the statute governs and the closed list of three conditions is the rule, so the open question is no longer *which rule* but *which condition we are already relying on*. And the published privacy policy has moved from a competing document to a wrong one, because §6's bar on consent by inactivity overrides both of the consent practices in it. Rewriting it is a client action and it belongs with EXT-5. **`E8-S1` gained scope from an answer, which is the direction scope usually does not move**: §6.2's higher-standard consent tier, §6's affirmative-act cookie consent, and §7.1's Standard Notice to Address Grievance, which is a GAID obligation this document had never carried. That last one comes with the finding underneath this whole answer: **the GAID 2025 is now named as a governing instrument and it is not in `docs/inputs/`, so part of E8-S1 is scoped against a directive nobody on this project has read.** The follow-up to Legal is three lines and does not re-ask what has been answered.
>
> The other half of this note is what E9 discovered rather than what it built. Reading the two controlling documents against each other produced five identifier conflicts, an unauthorised VAT withholding, a commission rate that appears in four sources with three readings, and a data-transfer rule the internal policy and the published one disagree about. Those are EXT-8 to EXT-12 below. **Two of them reach back into rows that already looked merely queued: `D4` is now blocked rather than open, because EXT-11 decides which region a bucket may sit in, and `E3-S2` therefore inherits a second external dependency it did not have this morning.**
>
> **Reconciled a ninth time on 2026-08-06, later the same day.** The note above is a record of the morning and the afternoon overtook it. **All five of EXT-8 to EXT-12 came back**, in one completed copy of the decision request, every response box filled and every one naming a decider. **Two close and three do not**, and the split matters more than the count. `EXT-11` and `EXT-12` close. `EXT-8`, `EXT-9` and `EXT-10` came back answered and stay open, each for a reason that is not "nobody replied": EXT-8's answer contradicts itself in three places, EXT-9's rate is 5% in every response box and 10% in every collation row of the same document, and EXT-10's counsel position is headed "Recommended counsel position for formal signature" with no signature under it. **No story in this document becomes startable**, which is the sentence a reader of five answers would least expect and is the one that is true.
>
> What moved is `D4`. **The region half is unblocked**: the second EXT-11 answer names the mechanism, an NDPC-approved transfer instrument or SCCs with the hosting provider and the subprocessors, so the row goes from ⛔ to ⏳ and the region becomes a choice rather than a wait. The sentence in the eighth note above, that the region choice still waits on EXT-11, is now false and is left standing as what was true when it was written. `E3-S2` keeps both its dependencies and loses the deferral inside one of them. Takeable is not taken: a non-Nigerian region cannot carry production data until an instrument is executed, and no executed instrument exists in this repository.
>
> Two acceptance criteria in E9 are now wrong rather than unmet, which is a distinction worth writing down because waiting will not fix either. **`E9-S2` criterion 3 is obsolete**: it asserts every identifier family draws from one location register, and EXT-8 question 4 splits them by family, so the criterion describes behaviour the decision forbids. **`E9-S3` criterion 6 is overruled**: it requires a test proving the Appendix C worked example to the naira, and EXT-10 rules that worked example unauthorised, so passing that test would prove the platform does the thing Finance just forbade. Both have to be rewritten before their stories are picked up. And `E9-S2`'s hold moved rather than lifted: management confirmed the ID Standard is under controlled revision, so the story now waits on **Version 2, due 2026-08-13**, and the instruction with it is that engineering must not permanently encode disputed rules until it is issued.
>
> The follow-up is deliberately not a new decision request. The three contradictions and four smaller gaps went into the closure schedule as items EXT-8 and EXT-9, because the cover of `ENG-DR-2026-08-06-01` reserves `-02` for a revision of itself and spending that number on a different subject would break the one rule the numbering has. **Three of the four smaller gaps were then answered later the same day, before the schedule was sent**, so item EXT-8 asks for three sentences and one instruction rather than for those and five more things. The answers are recorded inside the item rather than deleted from it, and the schedule's own revision log says so, because an item that quietly loses a line cannot show the line was ever settled.

### 3.2 Go-live gates

| Gate | Meaning | Owner | Blocked by |
| --- | --- | --- | --- |
| G1 | A buyer completes the on-platform journey on staging without staff intervention | Engineering | E1 |
| G2 | A test payout reaches a distinct seller account and a test refund is repaid by the gateway | Engineering plus Finance | E2 |
| G3 | No private document is reachable without authorization, verified by an unauthenticated probe suite | Security | E3, E4-S3 |
| G4 | Signed PoA instrument and terms of service approved by counsel | Client, external | E8-S2, EXT-4 |
| G5 | Independent security review closed with no high findings outstanding | External | E8-S3 |
| G6 | Escrow and settlement model confirmed against CBN and AML obligations | Client, external | EXT-1, and the section 14.2 activation approval |

> **G3 is half-earned, 2026-07-31.** The probe suite it asks for exists — `backend/src/storage/uploads-exposure.spec.ts`, written red in #103 and green since #112 — and no private document is reachable without authorization through the route it probes. The gate stays open because it is blocked by E3 and E4-S3, not by E3-S1: **E3-S2** is unstarted, and a document store that authorizes correctly and then loses the file on the next deploy does not pass a gate worded *no private document is reachable without authorization* in spirit, only in letter. Read the probe suite as the evidence G3 will eventually be closed with, not as the closing of it.
>
> **E4-S3 landed, 2026-08-01.** The other half of the gate's E4 dependency is now covered: `backend/src/common/authz/cross-role-authz.spec.ts` classifies all 51 path-parameter routes and drives 240 cross-role cells against the real services. G3 still waits on E3-S2, which is the storage half and has not started.
>
> **G1 is reachable now, 2026-08-02.** It did not move, and that is the point. Until D1 was answered, G1 asked engineering to demonstrate a journey nobody was allowed to build, so it was a gate against a decision rather than against work. E1 is scheduled, so from today G1 measures progress instead of standing in for a missing answer. G6 still names D2, which is the half of EXT-7 still outstanding.
>
> **G4 moved further out and G6 changed what it is waiting for, 2026-08-05.** Reading the client's own documents for E9 turned up that neither half of EXT-4 is where the schedule assumed it was. The terms of service file stops at section 10 and ends mid-clause, and what is missing from it is not decoration: limitation of liability, indemnity, governing law, jurisdiction, dispute resolution, fees, refunds, termination and every escrow term, from the contract of a platform that holds client money and runs a dispute flow. The Power of Attorney is a complete instrument but its clause 5 authorises a 10% deduction at source and says nothing about VAT, which is the withholding the specification's own worked example performs. **So G4 is not one review of two finished documents, it is a drafting job on one and a variation on the other, and it should be planned as weeks with counsel rather than a sign-off.** G6 no longer names D2, because D2 is answered; it names EXT-1, which is now a ring-fenced client-funds account rather than a merchant one, and it names section 14.2's production activation approval, which is a separate permission from the approval to build that engineering already has. **A gate that reads closed because the code is finished would be wrong here: G6 closes when somebody outside engineering signs the activation, and nothing in this repository can produce that signature.**

### 3.3 External inputs

Work the team cannot do with code.

**EXT-8 through EXT-12 went out on 2026-08-06, all five together, and all five came back the same
day.** They returned inside
[ENG-DR-2026-08-06-01_All_Decisions_Completed.docx](escalations/ENG-DR-2026-08-06-01_All_Decisions_Completed.docx),
every response box filled and every one naming a decider. **Two of the five close. Three do not.**
The full text, what was checked against the source and what each answer left open is on record in
[docs/escalations/2026-08-06-ext-8-and-ext-12.md](escalations/2026-08-06-ext-8-and-ext-12.md), and
what was sent is the client-facing form of it,
[ENG-DR-2026-08-06-01_Decision_Request.docx](escalations/ENG-DR-2026-08-06-01_Decision_Request.docx),
which puts a response box under each question and a collation sheet at the back. **Answered and
closed are different words in that record's second column on purpose.** Three cells carry an answer
that arrived, was read, and did not close the item, because the answer contradicts itself or because
it names a signature nobody has given yet. Writing a bare date in those cells would say the opposite
of what happened. This paragraph is not the authority on any of that, the table is. **And nothing
below was resolved toward one reading**: where the returned document contradicts itself, both
readings are recorded as written and the item stays open, because picking the more plausible one is
how a guess enters a record as a fact. Do not edit a question after it has been sent; add a dated
entry beneath it.

**EXT-1 to EXT-6 have never had a written ask behind them, only a row in this table, and a row is not
something a stakeholder can answer.** What each one needs, in the exact form that would close it, is
now on record in
[docs/escalations/2026-08-06-closure-schedule.md](escalations/2026-08-06-closure-schedule.md), with
the stakeholder-facing form in
[ENG-CS-2026-08-06-01_Closure_Schedule.docx](escalations/ENG-CS-2026-08-06-01_Closure_Schedule.docx).
It covers eleven items: EXT-1 to EXT-6, the two decision records still marked Proposed for behaviour
already running in production, ADR-0003 and ADR-0004, D3, and **EXT-8 and EXT-9, which joined it on
2026-08-06**. Those last two are not the questions asked again. They are the specific points the
2026-08-06 answers left unsettled, and they go in this schedule rather than in a second decision
request because the cover of `ENG-DR-2026-08-06-01` reserves `-02` for a revision of itself. It is
also split by owner into ten copies in the same directory, each carrying the front matter and only
that owner's items, so nobody is handed eleven items to find their one. **It has not been
dispatched**, and the dispatch table at the top of that file is the authority on that, not this
paragraph. **It asks for a
response by close of business today, 2026-08-06**, set on the cover on that date while the schedule
was still drafting, which the record file notes as an edit in place because a document nobody is
holding yet has no recipient to protect. The deadline is for what can be answered today: anything
that cannot be settled today comes back as `pending` with the date it is expected, which is a usable
answer because a story can be planned against a date and cannot be planned against silence. **A
response deadline is not a dispatch date.** If close of business passes with the schedule unsent,
the dispatch table stays empty and the deadline is what moves. ADR-0005 is
deliberately excluded from it at the requester's instruction of 2026-08-06 and D5 stays open. The
three sections below carry the closure conditions for EXT-4, EXT-5 and EXT-6 in full, because those
three are the ones where the ask is materially larger than the row suggests.

| ID | Input | Owner | Blocks |
| --- | --- | --- | --- |
| EXT-1 | Production Paystack live keys, and a **ring-fenced client-funds escrow account** with its own mandate, held apart from operating money | Client | E2-S1, E9-S4, G2, G6. **Restated 2026-08-05.** This used to read "a settlement account", which was the right ask while D2 was open and both readings were live. ADR-0002 closed it the other way: the platform holds client money, so the account is a liability account it reconciles under section 11.1 rather than a merchant account it sweeps. Same external party, materially larger ask, and it now blocks two epics |
| EXT-2 | S3-compatible bucket, credentials, region decision | Client or Corne Labs | E3-S2. **The region half was downstream of EXT-11 and its completed 2026-08-06 answer releases it.** The closed list governs and the approved mechanism is an NDPC-approved Cross-Border Data Transfer Instrument or standard contractual clauses, so the region is a choice rather than a wait: Nigerian needs no instrument, non-Nigerian cannot carry production data until one is executed. The closure schedule asks for the region and for the executed instrument in the same two rows |
| EXT-3 | Transactional email domain, SPF, DKIM, DMARC, SMTP credentials | Client | E6-S1 |
| EXT-4 | Counsel-approved PoA instrument text and terms of service | Client | E8-S2, G4. **Partial on both halves, 2026-08-05.** See below |
| EXT-5 | NDPR privacy notice and retention policy | Client | E8-S1 |
| EXT-6 | Penetration test vendor and window | Corne Labs | E8-S3, G5 |
| EXT-7 | Confirmation of D1 and D2 | Client | ~~E2~~. **Discharged 2026-08-05.** D1 came back on 2026-08-02 as on-platform purchase is in the MVP, which released E1. D2 came back on 2026-08-05 as SafeBuyRealties holds client funds, recorded in `docs/adr/0002-escrow-fund-holding-model.md`. This row is closed; what E2-S1 waits on now is EXT-1, which is an account and not an answer |
| EXT-8 | Digital Records to resolve five conflicts between the SafeBuy Realties ID Standard and SBR-FIN-DEV-SPEC-20260803-V1.5 | Client, Digital Records | E9-S2. **Answered 2026-08-06 by the COO with Digital Records, and not closed.** Four of the six sub-items settled, and three smaller gaps answered later the same day with no decider named. Three defects inside the answer hold the rest: `SUR` against `SVR`, a UUID instruction that contradicts the `-NNN` formats approved beside it, and an undefined ALD format. See below |
| EXT-9 | Finance to confirm the commission basis: one-sided or two-sided, collected or withheld, floor or rate | Client, Finance | E9-S3. **Answered 2026-08-06 by Finance, and not closed.** Two-sided, collected separately from each party rather than withheld, and configurable. The rate is the part that did not close: the response boxes say 5% per side and the collation sheet in the same document says 10% per side. See below |
| EXT-10 | Finance **and** counsel to confirm what authorises VAT withholding from seller proceeds | Client, Finance, counsel | E9-S3, G4. **Answered 2026-08-06 by Finance, and not closed.** Finance confirms nothing authorises it, the repository is right and FinGov §4 and Appendix C must change. The document heads its own counsel text "Recommended counsel position for formal signature" and counsel has not signed it. See below |
| EXT-11 | Legal to say which data-transfer rule governs, the internal policy's or the published one's | Client, legal | **Answered in two parts on 2026-08-06 and closed.** The statute governs and the strict rule wins, which settled the conflict and both consent questions; the completed document then named the mechanism, an NDPC-approved transfer instrument or SCCs. That released the region half of D4, EXT-2 and ADR-0004. It converts into an executed instrument, an amended privacy policy and a copy of GAID 2025, which are asked for in the closure schedule. See below |
| EXT-12 | Management to settle the entity name, registered address and canonical domain, and to say whether the ID Standard is currently under revision | Client, management | E9-S2, E8-S2, and **any further PoA generation**. **Answered 2026-08-06 by management and closed.** The entity, address and canonical domain are settled and the standard is under revision, with ID Standard Version 2 due 2026-08-13. What is left is two dated successors rather than two open questions. See below |

#### EXT-4, partial on both halves

The schedule assumed EXT-4 was a review of two finished documents. It is not. The Power of Attorney is a complete instrument with a clause that does not cover what the platform does, and the terms of service is not a complete document at all: `docs/inputs/SBR TERMS AND CONDITIONS SAFEBUY.docx` stops at section 10, Intellectual Property, and ends mid-clause. **The table below is the request to counsel.** It is what a platform that holds client money and runs a dispute flow does not currently promise or reserve anywhere.

| Absent | Why it matters here |
| --- | --- |
| Limitation of liability | No cap on a due diligence report that misses an encumbrance |
| Indemnity | Nothing shifts user-uploaded forged-document risk |
| Governing law and jurisdiction | No forum for any dispute |
| Dispute resolution | E5's dispute flow has no contractual basis |
| Fees, payment and refund terms | Escrow refunds have no stated contractual trigger |
| **Any escrow terms at all** | The document never uses the word |
| Termination and suspension of service | §4.5 covers accounts only |
| Cross-reference to the Privacy Policy | Privacy §18 assumes acceptance flows through the Terms |
| Amendment, severability, force majeure, entire agreement | Standard boilerplate, all absent |

Two more items go to counsel in the same bundle. Section 10 vests site content in "the Founder of SafeBuy Realties International Limited", an individual rather than the company, which is a different owner from the one every other document names. And section 5(a) obliges users to charge "a minimum of 5% commission apiece from both buyers and seller cumulatively", which is the published promise the commission question below has to be reconciled against.

#### EXT-4, what closes it

**Three documents, not two.** The clause table above is the request to counsel on the terms of
service. It is not the whole of EXT-4, and treating it as the whole of EXT-4 is how this row came to
be sized at one developer-day.

1. **The terms of service, completed.** The nine absent clause families in the table above, plus the
   two corrections: §10 vests site content in "the Founder", an individual and not the company, and
   §5(a)'s minimum 5% apiece has to be reconciled against whatever EXT-9 comes back with.
2. **The seller Power of Attorney.** `docs/inputs/SBR -POWER OF ATTORNEY.docx` is dated 2017 in its
   body, has a witness block with no attestation clause above it, and carries no stamping clause, no
   Land Registry registration clause and no Governor's consent clause under the Land Use Act. Its
   clause 5 authorises deducting 10% at source, which is EXT-9 and EXT-10 arriving inside a signed
   instrument.
3. **The instrument the platform generates**, `backend/src/poa/poa.service.ts` lines 103 to 159.
   Counsel has never seen it. Its seven clauses were written in a build checklist, not by a lawyer,
   and it is the document a real seller actually signs. **One question in it decides whether the
   feature is lawful at all:** can an instrument granting authority over land be executed
   electronically under the Evidence Act 2011 and the Electronic Transactions Act 2023, or is land
   carved out? If it is carved out, the platform has to produce a print-and-execute pack instead,
   which is a build change and not a wording change, and E8-S2 is not an L.

**Sequencing, and it is the reason this cannot simply be started.** EXT-9, EXT-10 and EXT-12 all sit
inside the text counsel would be approving: the commission basis, the VAT authority, and the
registered entity name that appears on every page of all three documents. Instructing counsel before
those three come back means paying for a review of text that then changes. `RUNBOOK.md:420` already
records that issued instruments cannot be recalled, so **further PoA generation stays blocked** on
EXT-12 regardless of where counsel is.

**Two of those three came back on 2026-08-06 and the sequencing improved rather than cleared.**
EXT-12 closed and supplies agreed values for the entity, the RC number, the registered address and
the canonical domain, so the naming half of the review is no longer a review of three spellings.
EXT-10 came back from Finance and lands **more** work here rather than less: counsel's signature on
the VAT position already drafted, the CEO, COO and CFO approval of the configuration, and two
conditions counsel's own draft sets that are not VAT work at all, being that the buyer and seller
engagement documents expressly state "commission plus applicable VAT" and that the entity named on
them is Safebuyrealties International Ltd. **EXT-9 is the one still moving underneath the text**: the
structure is settled, the rate is not, and the rate is a number that appears in the terms. And the
buyer-side commission EXT-9 confirmed needs an instrument to sit on, because PoA clause 5 authorises
deduction from the seller only, which is a new item for counsel rather than a wording tweak. All of
these are rows in the closure schedule's EXT-4 item.

What comes back closes this row: counsel's name and the date they were instructed, the expected
return date, confirmation they hold all three documents rather than the first one, and their position
on electronic execution of a land instrument.

#### EXT-5, what closes it

**Both documents already exist in the repository and both are structurally complete.** This is not a
request for a privacy notice that has never been written. `docs/inputs/SBR PRIVACY POLICY.docx` and
`docs/inputs/SB DATA PROTECTION POLICY.docx` are both there. It is a request for six things they do
not contain, and reading the client's own internal policy widened the row rather than narrowing it:
four of the six are obligations that policy creates for itself and then does not discharge.

1. **Board adoption.** The internal policy's first line reads "SUBJECT TO BOARD APPROVAL". Encoding
   retention rules against an unadopted policy means encoding something the board may still change.
   Needed: the adoption date, the resolution reference, and that line coming off the adopted version.
2. **A named DPO.** Internal §8 creates the role and appoints nobody. §8 also makes the DPO the
   person who advises on data protection impact assessments, so **E8-S1 criterion 8 cannot be validly
   signed off while the role is vacant**, and there is no DPIA in this repository at all.
3. **A licensed data protection compliance organisation**, required by internal §9. None is engaged,
   nothing has been procured, and this has a lead time measured in weeks rather than days.
4. **The date business operations commenced.** Internal §10.1 sets the initial compliance audit at
   fifteen months from that date. Nobody in this repository has the date, so nobody can say whether
   the clock has already started. §10.2 also requires annual returns by 31 March, which is a calendar
   obligation on the business and not a build task.
5. **Whether erasure means deletion or crypto-shredding** where a record must be retained by law.
   This decides what E8-S1's erasure feature does to a record it is not permitted to destroy, and it
   cannot be inferred from either document.
6. **Retention periods, one per data category.** Neither document states a period, in days or years,
   for anything. Published §9.1 says "as long as is reasonably necessary" and internal §14 requires
   the record of processing activities to carry periods it never supplies. **E8-S1 criterion 3 makes
   an unset period a loud failure rather than a silent default**, so a missing number blocks that one
   category and not the story. The eight categories are KYC identity documents, KYC selfie and
   liveness images, professional credentials, transaction and payment records, audit and access logs,
   marketing consent records, cookie and analytics data, and account data after closure. Internal
   §4.5's six months has to be reconciled against whatever comes back, and that reconciliation is the
   DPO's to make in writing rather than engineering's to assume.

The cross-border half of this row is EXT-11 and is not restated here. **Six developer-days is the
build, and it is not the lead time.** Engaging a DPCO and getting a policy through a board are the
long poles, and neither has started.

**EXT-11 closed on 2026-08-06 and put two new documents into this row.** The published privacy policy
is now under instruction to be amended so it matches the internal policy and the governing law, which
is a client action rather than an engineering one and is asked for here. And the GAID 2025 is still
not in `docs/inputs/`: it was asked for once, the second answer did not carry it, and the request
stands, because E8-S1 is scoped against a directive nobody on this project has opened. **The policy's
effective date is platform go-live**, which is the third thing this row inherited: anything that must
be true on day one has to be true before go-live rather than after it.

#### EXT-6, what closes it

**The only external input on this list with no upstream dependency.** It waits on nothing, it could
be booked today, and what is missing is the booking rather than the test. That makes it the cheapest
thing on the critical path to move and the one most likely to be forgotten because it looks small.

What has to come back: the vendor and a named contact; a scope of work naming all four areas E8-S3
criterion 1 requires, being authentication, authorization, payments and document handling, and
explicitly including the escrow payment path and the KYC document store; whether the engagement is
black, grey or white box; the environment, which must not be production carrying live customer data;
the start and end dates; rules of engagement covering the seeded test data set, any out-of-hours
constraint and who to call when something breaks mid-test; the date the report is due; and **the date
the re-test letter is due**, which is its own artifact under criterion 4. Gate G5 reads "no high
findings outstanding", and only an independent party can attest to that, so the re-test letter is the
thing that actually closes the gate rather than the first report.

#### EXT-8, the five identifier conflicts

Sent 2026-08-06 to Digital Records, copied to Finance because conflict 1 is a billing blocker and to
Product, inside ENG-DR-2026-08-06-01. **Answered the same day by the Chief Operating Officer with
Digital Records, and not closed.** The five below are the question as it was asked. What came back,
what it settles and the three defects that hold it are at the end of this section.

**Lead with this sentence, because it is the one with a user in it: the published terms promise users a professional category the platform cannot issue an identifier for.** Terms §2 and the privacy policy §1 both name nine categories, including plumbers, electricians and interior designers, and none of those three has a code in either coded list. That is conflict 4 below, stated the way a user meets it rather than the way a schema does, and it is the lead rather than a sixth item.

**Second sentence: nothing has been issued yet.** The platform generates no professional identifier at all, so every conflict here is latent, and whatever Digital Records rules gets encoded once with nothing to correct. This is a decision that is still free.

The five:

1. **`SBR-CASE-ENV` and `SBR-CASE-SEC` are defined in one document and absent from the other.** The ID Standard defines neither. FinGov §5 defines both, with worked examples, and §3.2 binds them to billing sub-codes 22 and 24. Sub-code 22 cannot be billed without an identifier format for the case it bills, so this is a billing blocker rather than a naming preference.
2. **`SBR-SRV-BUY` versus `SBR-SRV-TYPE`.** The ID Standard hard-codes `BUY`; FinGov §5 writes `TYPE` with `BUY` as an example value. Every service request the platform issues today asserts it is a buyer request. If a service request can ever be a seller or due-diligence type, the whole issued estate is mis-asserting.
3. **The standard contradicts itself on which register non-property identifiers draw from.** §2.0 rule 6 implies the national register throughout, but §3.0 and §4.0 give their formats and examples with Lagos codes, while §7.0 gives its examples with national ones. Until this is answered only the property register mapping is safe to implement, which is E9-S2's stated scope and the reason that story is deliberately narrow.
4. **There are four professional category lists and no two agree.** The ID Standard §4.0 codes **six**: LAW, SUR, VAL, AGT, ARC, ENG. The repository's `ProfessionalType` enum has **seven**: LAWYER, SURVEYOR, VALUER, ARCHITECT, ENGINEER, BUILDER, QUANTITY\_SURVEYOR. FinGov §5.1 codes **thirteen**, the standard's six plus QSV, BLD, PLN, PJM, CON, SUP, SSP. Terms §2 and privacy §1 name **nine** in prose, three of them coded nowhere.

   The counts are the least interesting part of this. **The repository crosses the ID Standard rather than nesting inside it.** It has BUILDER and QUANTITY\_SURVEYOR, which the ID Standard cannot issue identifiers for, and it lacks Estate Agent, which both controlling documents code. So the platform can already model two professional types it could never identify, and cannot model one that both documents expect, which for a real estate business is the strangest of the four gaps. FinGov is a strict superset of the standard on membership, so those two may be a versioning question rather than a disagreement, and the escalation asks which way round that is.

   Two further readings of the same four sets. **`AGT` and `VAL` appear in no published document**: Estate Agent and Valuer are coded in both controlling documents and named in neither the terms nor the privacy policy, and Estate Agent is absent from the enum as well, so the escalation asks outright whether the platform serves that category at all. And **the enum looks derived from the marketing prose rather than from the standard**: the published nine is the enum's seven minus VALUER plus the three uncoded trades, which if it is what happened means the ID Standard has never been the source of the platform's category list. Both published lists also end "and other related professionals", so the prose never closes the set, and a coded list has to.

5. **`SUR` means two things inside the same document.** §4.0 gives `SBR-SUR-...` for Surveyor; §5.0 gives `SUR` for Surulere. A reader holding a `SUR` segment cannot tell from the identifier alone which register it came from. Survivable if conflict 3 comes back with a hard per-type rule, live if it does not, so it goes up alongside it. Cheap to answer, which is the argument for asking rather than footnoting it.

Until EXT-8 comes back, **no identifier format is to be changed except the property register mapping**, and every other location segment stays on its current behaviour behind a named gap rather than a guess.

**Answered 2026-08-06, and it does not close.** Adebiyi Emmanuel Babatope, COO, named in all six response boxes, with Digital Records. The full text and what was checked against the source is in [the escalation record](escalations/2026-08-06-ext-8-and-ext-12.md#answer-2026-08-06-ext-8). Most of it worked, which is worth saying before the part that did not.

Four things are settled. **There is now one authoritative list of professional categories**: thirteen coded, LAW, SUR, VAL, AGT, ARC, ENG, QSV, BLD, PLN, PJM, CON, SUP and SSP, plus ALD as a controlled fourteenth for approved allied trades. All seven values in `ProfessionalType` appear in it, so the platform is a subset of the standard rather than a competing version, and this is an enum expansion rather than a migration of existing rows. **Estate Agent is in scope**, answered as a plain yes and to be added to the platform, the terms and the privacy policy, which closes the strangest of the four gaps. **Both case formats are approved** and sub-codes 22 and 24 may be billed against them, which clears the revenue blocker. **Non-property identifiers have a rule**: property-related identifiers use the property-location register, buyer, seller, professional, general service and administrative identifiers use the national register, and a property-linked case, inspection, escrow or dispute inherits the property location. **That last one obsoletes E9-S2's acceptance criterion 3**, which was written to work around the absence of exactly this rule.

Three defects hold the rest, and each is a contradiction inside the returned document rather than a disagreement between the document and this team, so none can be resolved by reading it more carefully. **`SUR` or `SVR` for Surveyor**: the question 5 box rules `SVR`, and three other places in the same document say `SUR`, being the authoritative list, the EXT-12 answer and the collation sheet. Three against one is suggestive and is not a decision, and the professional-type code is written into stored identifiers, so choosing wrong is not a rename later. **UUID against the four `-NNN` formats approved on the same pages**: the scoping box says UUID replaces `NNN` to prevent collisions, and four formats approved in the same document end in `-NNN`. The stated reason does not hold against the code, because `NNN` is not a random number: [sbr-id.service.ts:40-96](../backend/src/sbr-id/sbr-id.service.ts#L40-L96) draws it from a per-prefix, per-day upsert counter, so a collision under the same prefix on the same day cannot happen. If the instruction stands, the four approved formats are wrong as printed. If the formats stand, the instruction is. **We are not choosing between them.** **And the ALD format is undefined**: `SBR-ALD-LOCYYXX-NNN` runs three segments together with no separator, which no other format in the document does, and `XX` is defined nowhere.

Four smaller gaps went up with them and three came back the same day, relayed rather than returned in a document. **A building material seller is coded `ALD`**, not `SUP`, which was the one real collision in the fourteen-category list. **The TYPE list is closed at BUY, SEL, DD, PRO and PRT, and no others for now**, so a validator can reject a sixth value, which it could not do while the list was introduced with "including". **`SBR-CASE-DD` is approved as a third case type**, which is the only one of the three with a retrospective effect and the effect is that nothing has to be undone: the identifiers this platform has already issued under it are valid and no remediation follows. The fourth gap goes with the first, since the row headed "the three uncoded trades" names four and the fourth is the building material seller, which now has a code. **None of the three carries a name or a role**, which every other answer against EXT-8 does, so the attribution is recorded as outstanding rather than filled in with a department. What is left in that group is one instruction rather than a question: "run the production-impact query before remediation" comes back addressed to the people who had already said, in the dispatched question, that nobody on this side has production database access.

**The hold stands.** No identifier format changes until the three contradictions come back, because encoding either reading of any of them is a guess written into stored data. The three answers of 6 August do not touch any of the three, and one of them makes the second slightly larger: a third approved case format ending in `-NNN` means the UUID instruction now stands against five formats rather than four.

#### EXT-9, the commission basis

Four sources, three readings. The repository charges 5% on the seller side only and has no buyer commission at all. The Power of Attorney clause 5 says the donee deducts 10% at source. The terms §5(a) say a minimum of 5% from buyer and seller cumulatively. FinGov sub-codes 11 and 12 exist separately for buyer and seller, which corroborates two-sided. The likeliest reconciliation is that 5% plus 5% is the PoA's 10% at source, and that is exactly the kind of thing that has to be confirmed rather than inferred. **Send Finance these three questions:**

1. Is the commission one-sided or two-sided? The repo charges the seller side only and has **no buyer commission at all**, despite sub-code 11 existing for it.
2. If two-sided, is the buyer's 5% collected from the buyer, or withheld from the seller's proceeds alongside the seller's 5%, which is what "deduct from source 10%" would mean?
3. Is "minimum of 5%" a floor with a configurable actual rate, or the rate itself?

**Answered 2026-08-06, and it does not close.** Aregbe Idris, Finance, named in all three response boxes. Full text in [the escalation record](escalations/2026-08-06-ext-8-and-ext-12.md#answer-2026-08-06-ext-9). **The structure is settled and the number is not.**

All three questions came back. Commission is **two-sided**, so sub-code 11 finally has something behind it and a buyer side has to be built. The **buyer pays the buyer's share**, "collected from the buyer. It must not be withheld from the seller's proceeds", which is the answer that matters most to a seller and is the one place the reply is completely unambiguous. And it is **a rate rather than a floor**, with authorised users able to edit it for an approved transaction-specific variation, so the terms' "minimum of 5%" becomes a standard rate an override can move on one transaction.

**The rate contradicts itself inside the one document.** Every response box says 5% per side. Every collation row for the same questions says 10% per side. On the document's own NGN 50,000,000 worked example that is NGN 2,500,000 per side against NGN 5,000,000 per side, so it is not a rounding difference or a presentational one. One of the two reconciles with the signed instrument and the other does not: PoA clause 5 authorises deducting 10% at source, five plus five comes to exactly that, and ten plus ten comes to twice it. **That is an observation about the instrument, not us choosing the rate**, and the collation sheet is part of the same signed-off document. For scale, `PLATFORM_FEE_RATE` at [escrow.constants.ts:3](../backend/src/escrow/escrow.constants.ts#L3) is `0.05` applied to the seller side only: under 5% the existing constant is already right and the work is adding a buyer side, and under 10% both sides change and every worked example in the Financial Governance specification changes with them.

Two things have to come back. **The rate, one line**, and which of the two places in the document is the error. And **who "authorised users" means**, because that is not a role this platform has, and a per-transaction commission override is a money-moving control that ships behind a flag, default off, until Finance, Legal and technical sign-off. Both are asked at EXT-9 in the closure schedule.

**One consequence for the buyer side that is not a question.** Clause 5 authorises deduction from the seller only, so a buyer-facing charge needs a buyer-facing instrument to sit on. That is EXT-4 row 8 and it is counsel's work, not Finance's.

#### EXT-10, the VAT withholding has no instrument behind it

This goes to Finance and counsel as its own item rather than folded into EXT-9, because it is not a rate question. **No document the seller signs authorises the platform to withhold VAT from their proceeds.** PoA clause 5 authorises the 10% brokerage deduction and stops there. FinGov §4's formula and Appendix C's worked example both withhold VAT anyway: on a NGN 50,000,000 sale the example takes 2,500,000 commission and 187,500 VAT and pays the seller 47,312,500, where this repository would pay 47,500,000. The repository is the one that matches the signed instrument. The fix may be a drafting change to clause 5 rather than a configuration value, and either way it has to be answered before E9-S3 writes a rate down.

**Answered 2026-08-06 by Finance, and it does not close.** Full text in [the escalation record](escalations/2026-08-06-ext-8-and-ext-12.md#answer-2026-08-06-ext-10). On substance the answer is complete and it goes the way the escalation argued: "VAT must not be withheld from the seller's property-sale proceeds. VAT may only be charged on the commission receivable from the buyer and the seller", because the company facilitates sales rather than selling properties, so the sale price is not its taxable supply and the commission is.

**That confirms what the platform already does and moves the correction onto the specification.** VAT comes from [getVatRate](../backend/src/platform-config/platform-config.service.ts#L127) at three call sites, all of them service fees, and no VAT touches the escrow payout path. FinGov §4's formula and Appendix C's worked example are the documents that are now wrong. **E9-S3's acceptance criterion 6, which requires a test proving the Appendix C worked example to the naira, is overruled by this answer** and has to be rewritten before that story is picked up, or the story encodes the thing the ruling forbids and proves it with a passing test. A sub-account is also to be operated for the purpose, which is new banking work and belongs with EXT-1.

**What does not close is the signature.** EXT-10's owner is Finance **and counsel, together**. The counsel row in the returned document is headed "Recommended counsel position for formal signature", which is a draft awaiting a signature and says so, and the document sets its own condition in the same box: "No production VAT automation should activate until counsel signs this position and the CEO, COO and CFO approve the configuration." Nothing in this repository can produce that signature and no agent may tick it. Three things have to come back: counsel's signature on the wording already drafted, the CEO, COO and CFO approval of the configuration, and confirmation that FinGov §4 and Appendix C are being corrected, because until one of them changes the authoritative document and the authoritative decision disagree. The first two are asked at EXT-4 rows 6 and 7 in the closure schedule, because they are counsel's work rather than Finance's.

#### EXT-11, which data-transfer rule governs, answered twice and closed

The client's internal data protection policy §12 says personal data **shall not** be transferred outside Nigeria unless one of three conditions is met: an adequacy decision, NDPC-approved standard contractual clauses, or a valid statutory exception. The published privacy policy §10 promises only that reasonable steps are taken. The internal document is the stricter of the two and the platform already runs on non-Nigerian infrastructure, so this is a live exposure and not a future one. **ADR-0004's region choice could not be made until it was answered**, because "reasonable steps" and a closed list of three conditions produce different bucket configurations, and that is why D4 above read blocked from 2026-08-05 until this came back. Two further conflicts go up with it: the published policy treats browser settings as cookie consent, and treats continued browsing as consent, neither of which the internal policy or the NDPA supports. Engineering's position in the meantime is to encode the stricter rule and let the tests be the record of which document won.

**Answered in part on 2026-08-06 by Legal, then answered in full the same day and closed.** The first reply and what was checked against the source is in [the escalation record](escalations/2026-08-06-ext-8-and-ext-12.md#answer-2026-08-06); the second is [under it](escalations/2026-08-06-ext-8-and-ext-12.md#second-answer-2026-08-06-ext-11). Three things changed on the first reply and one did not, and the second reply is the one that did not.

The governing instrument question is settled, and settled a level above where it was asked. Neither company document governs: the **NDPA 2023 and the GAID 2025** do, and both company documents sit underneath them. A company document cannot lower a statutory floor, so §12's closed list survives and the published policy's "reasonable steps" does not, whatever the website says. That confirms engineering's interim position rather than overturning it.

Both consent conflicts are settled too, though by the section Legal pointed at rather than by name. §6's "No implied consent: Silence, pre-ticked boxes, or inactivity does not constitute consent" disposes of continued browsing, and §6.1's requirement that cookie consent state the purpose and the party responsible disposes of browser settings. **That is engineering's reading of the ruling and is recorded as a reading**, not as words Legal wrote. It is wrong only in the strict direction if it is wrong at all. §6.2 also gives E8-S1 something it did not have: a named higher-standard consent tier for sensitive data, which `KycRecord` holds.

**What the first reply did not change was the part that was holding work.** Which of the three §12 conditions the non-Nigerian infrastructure already in use sits under, and what must be in place before a region is chosen, was not answered, so D4, ADR-0004's region sub-decision and the region half of EXT-2 all stayed where they were for the length of one document.

**The second answer, the same day, settles exactly that, and it closes EXT-11.** From the Managing Director/CEO and Board of Directors, implemented by Legal and the DPO, which is also the named person and role the first reply was missing. The mechanism: "For the current non-Nigerian cloud infrastructure, the approved mechanism shall be an NDPC-approved Cross-Border Data Transfer Instrument or standard contractual clauses with the hosting provider and relevant subprocessors." That is a choice between the three conditions rather than a restatement of them, and it rules out both readings that were doing the damage: "Until executed and documented, no new production transfer should rely on general consent or 'reasonable steps'; any statutory exception must be approved by Legal for a specific transfer." The governing documents are restated with GAID in them, and the published privacy policy is put under instruction to amend, which was not true that morning.

**What it releases.** The region half of D4 moves from blocked to open, ADR-0004's storage sub-decision is unblocked and only that sub-decision, and the region half of EXT-2 is released. Takeable is not taken: somebody still chooses, and the choice is now between a Nigerian region and a non-Nigerian region with an executed instrument behind it.

**What it converts into, which is not EXT-11 asked again.** An **executed transfer instrument or set of SCCs** with the hosting provider and the subprocessors, which does not exist in this repository, and until it does the ruling's own words hold, so this is now the gating condition on EXT-2 rather than the region choice alone. An **amendment to the published privacy policy**, which is EXT-5's document and a new instruction. And a **policy effective date of platform go-live**, which means anything that must be true on day one has to be true before go-live rather than after it. All three are asked for in the closure schedule.

**And the ruling added a document this project has never read.** GAID 2025 is named as governing. It is cited to §1, where our copy has only the NDPA 2023, but it is genuinely in the policy at §7, §7.1 and §8, so this is a citation slip and not a stale copy. The instrument itself is not in `docs/inputs/` and nothing has been scoped against it. One consequence is already visible: §7.1 requires a **Standard Notice to Address Grievance** as a GAID obligation, and SNAG appears nowhere in this backlog, the board or the codebase. E8-S1 is scoped against a directive nobody here has opened. Two of the three things that follow-up asked for arrived in the second answer, being question 2 and a named person. **The copy of the GAID did not, and that request stands.** It is EXT-5 row 8 in the closure schedule.

#### EXT-12, whose company is this and is the standard moving

Four documents give three spellings of the company name and two addresses, and the terms give a website, `safebuyrealtiesltd.com`, that is not the domain the code bakes into every Power of Attorney QR code, `safebuyrealties.com`. `RUNBOOK.md:420` already records that issued instruments cannot be recalled, so **generating further instruments is blocked on this answer** rather than merely inadvisable. In the same message, ask whether the ID Standard is currently being revised: a Word lock file beside it says the document is open on somebody's desk, and E9-S2 encodes 32 Lagos codes and 38 national codes from it. If it is under revision, E9-S2 waits for the revision instead of encoding a version about to be superseded. E9-S1 does not wait, because its tables contain no location code at all.

**Answered 2026-08-06 by management, in full, and closed.** All four of the things this item asked for came back. Full text in [the escalation record](escalations/2026-08-06-ext-8-and-ext-12.md#answer-2026-08-06-ext-12).

**Yes, the standard is under revision**, and **Version 2 is due 2026-08-13**, "and in all cases before platform go-live or further Power of Attorney generation". The registers are among what is changing, but not by replacement: the 32 Lagos and 38 national values survive, and what changes is which family draws from which register. **The entity is Safebuyrealties International Ltd**, RC 8483982, Suite 404, 4th Floor, 14 Allen Avenue, Centage Plaza, Ikeja, Lagos. **The canonical domain is `www.safebuyrealtiesltd.com`**, with the control question answered too: the domain, registrar account, DNS, certificates, renewal billing and recovery credentials are to be held in a company-controlled account. And a direct instruction about a value in this code: "Do not print safebuyrealties.com on instruments unless Management separately confirms company ownership and approval." [poa-verify-config.ts:7](../backend/src/config/poa-verify-config.ts#L7) defaults to exactly that domain. Correcting it is EXT-4's work rather than a config tweak taken on this record.

**Closed is not released.** The hold on Power of Attorney generation stays in the decision's own words, "until the templates and QR destination are corrected and tested", which is now backed by a management decision rather than only by this project's caution. **E9-S2's hold moved rather than lifted**: it was held pending the answer, the answer is yes, so it is held until Version 2 on 2026-08-13, and "must not permanently encode disputed rules" is the operative phrase. What this converts into is two dated successors rather than two open questions: ID Standard Version 2 to receive on 2026-08-13, and the PoA template and QR correction, which is EXT-4's list and now has agreed values in it rather than three spellings.

---

## 4. Stories

Each story states the user value, the acceptance criteria a reviewer can check, the technical notes a developer needs, and the evidence for the gap.

---

### Epic E1, close the on-platform transaction loop

**Stakeholder value.** Today the platform can take due diligence money for a listed property and then cannot deliver the case, cannot report on it, and cannot sell the property. This epic makes the flagship journey finish.

---

#### E1-S1, listing DD case lifecycle

> **As** an operations officer, **I want** due diligence orders raised against a platform listing to appear in my queue so that I can assign professionals, collect their reports, and complete the case, **so that** a buyer who paid for due diligence receives it.

**Size** L · **Flag** `dd_case_lifecycle` · **Deps** none. D1 was answered on 2026-08-02, and this story merged as PR #138 the following day

**Evidence of the gap**

- `backend/src/due-diligence/due-diligence.service.ts` is 104 lines and exposes one method, `create()` at line 34.
- `backend/src/due-diligence/due-diligence.controller.ts` exposes one route, `@Post()` at line 17.
- `src/routes/dashboard.admin.due-diligence.tsx:10` and `:52` read from `useStandaloneDdOrdersQuery`, so the admin due diligence queue only ever shows standalone orders.
- The full lifecycle it needs already exists next door in `backend/src/standalone-dd/standalone-dd.service.ts` (1590 lines) and `DueDiligenceAssignment` is already in the schema at `prisma/schema.prisma:414`.

**Acceptance criteria**

1. ✅ `GET /due-diligence-orders` is `list()` at `backend/src/due-diligence/due-diligence-case.service.ts:63`. The `where` is built from three things: `source: LISTING`, `buyerId: actor.sub` for anybody who is not internal, and `status` when the query carries one. Page and page size default to 1 and 20 and the count runs in the same `$transaction` as the page, so the total a caller pages against is the total that existed when the page was read. The scope filter sits in the query rather than in a decorator on purpose, and the comment above it says why: a later route added to this service does not inherit a decorator.
2. ✅ `GET /due-diligence-orders/:id` is `getOne()` at `:87`, and every read goes through `loadListingCase()` at `:264`. A standalone order asked for by its id is 404 here, and so is a listing case belonging to another buyer. Not 403. A 403 confirms the case exists, and knowing that a neighbouring id resolves is enough to learn that a given property is under due diligence. The response is `DdCaseSerializer.serializeOrder`, which carries the listing, the selected schedule items, the assignments and a signed URL per report.
3. ✅ `POST /due-diligence-orders/:id/assignments` is `assign()` at `:100`. `DdCoreService.resolveAssignableProfessional` at `backend/src/dd-core/dd-core.service.ts:110` returns a discriminated result and the route throws `UnprocessableEntityException` on the failing branch, so it is a 422 and not a 400: the request is well formed and it is somebody else's profile that makes it impossible. `describeMissingCredential` at `:141` writes the reason in the words an operations officer would use chasing it, and it reports a rejection ahead of a missing document, because re-uploading a document does not answer a rejection.
4. ✅ `POST /due-diligence-assignments/:id/report` is `submitAssignmentReport()` at `:206`, on its own controller. A caller who is not the assignee, and a caller naming an assignment that belongs to a standalone case, both get the same 404 as a caller naming an assignment that does not exist. The controller carries no `@Roles` for that reason, and its class comment records it: a role check would answer some of those callers 403 and hand anybody holding a list of ids a map of who is working on what.
5. ✅ `PATCH /due-diligence-orders/:id` is `updateStatus()` at `:168` and the table is `LISTING_DD_TRANSITIONS` at `backend/src/dd-core/dd-case.constants.ts:53`. `PAID` to `IN_PROGRESS` to `COMPLETE`, `CANCELLED` reachable from anywhere not already terminal, and both terminal statuses with no outward edges at all, because a completed case that can be dragged back to `IN_PROGRESS` is a case whose verdict means nothing. The transition check runs before the verdict check, since a request to complete a `PENDING` case is wrong about where the case is, and being told to supply a verdict would send the operator off to write one for a case that will not accept it.
6. ✅ Three `audit.log` calls, at `:120`, `:180` and `:223`, each carrying `before` and `after`. `notifyCaseParticipants()` at `:305` builds the recipients as a `Set` of the buyer, the seller and every assigned professional, so a person holding two of those roles is told once rather than twice, and the actor who caused the event is excluded from the notification about their own action. The seller is fetched separately at `:338` rather than through the shared include, because putting `sellerId` in that include would leak it into the standalone response, where a guest holding a Service ID can read a case.
7. ✅ All five routes carry `@RequiresFeature("dd_case_lifecycle")`, four in `due-diligence.controller.ts` and one in `due-diligence-assignments.controller.ts`. The flag is registered at `backend/src/feature-flags/feature-flags.constants.ts:33` with `defaultEnabled: false`, and the global `FeatureGuard` throws `NotFoundException` when it is off, so with the flag off the new routes are 404 and production behaves exactly as it did.
8. ✅ 32 tests in `due-diligence-case.service.spec.ts` and 26 in `dd-core.service.spec.ts`. Every legal transition and every illegal one is covered, including both terminal statuses refusing to move and the completion that is refused for want of a verdict. Full backend suite green at 58 files and 1118 tests, and the section 0.3 diff bar is cleared at **85.4%**, 315 of 369 changed lines across 15 files against a bar of 80%.

**Technical notes**

Do not copy `standalone-dd.service.ts`. Extract the shared case machinery into a `dd-core` provider that both modules consume, otherwise this becomes a 1590-line duplicate and the two paths drift. `ServiceRequest.source` already distinguishes `LISTING` from `STANDALONE`, so the same tables serve both. The reviewer should block a copy-paste implementation on the SOLID and duplication rules.

**Delivered** in PR #138, and the technical note above is the part worth reading first, because it decided the shape of the diff. The shared machinery came out into `backend/src/dd-core/`: `DdCoreService` holds the queue scoping, the assignment creation, the professional verification check, the report upload and the transition write, and `DdCaseSerializer` holds the one shape both paths return, signed URLs included. Both modules now consume it, so `standalone-dd.service.ts` lost about 600 lines rather than gaining a twin, and the listing path was built out of what was left rather than out of a copy. `DueDiligenceOrder.source` carries `LISTING` against `STANDALONE` through `DD_SOURCE` in `backend/src/dd-core/dd-case.constants.ts`. No schema change and no migration.

Five routes, all of them behind `dd_case_lifecycle` and all of them 404 while it is off: the scoped and paginated queue, the single case read, operator assignment, the assignee's report upload on `POST /due-diligence-assignments/:id/report`, and the status patch. The transition table runs `PAID` to `IN_PROGRESS` to `COMPLETE`, demands a verdict before it will complete, and refuses everything off it. A caller who does not own a case gets 404 and never 403, on the reads and on the report route alike, which is why the assignments controller carries no `@Roles`: a role check would answer some of those callers 403 and give away that the case exists. Every transition writes an `AuditLog` row and notifies the buyer, the seller and each assigned professional once.

One thing came along for free and was worth naming so E1-S2 was not re-estimated on a false premise. The `Transaction` beside the order moves, `DD_IN_PROGRESS` on the first assignment and `DD_COMPLETE` on sign-off, because that behaviour was in the standalone service and the extraction carried it to both paths. What it did not have was a table, atomicity, an idempotency guard or `CANCELLED` handling, which is exactly what E1-S2 was for, and #139 has since supplied all four. The row got smaller in one sense and not at all in the sense that mattered.

Two differences from standalone are deliberate rather than oversights. Standalone still has no transition table, so its statuses move freely, and it still lets staff file a report against somebody else's assignment; both are its existing behaviour and changing either belongs to its own story. Its unverified-professional rejection kept its 400 and only gained a message that names the missing credential, while the listing path answers 422 as criterion 3 asks.

---

#### E1-S2, transaction state machine

> **As** a buyer, **I want** my transaction to advance as the due diligence work progresses, **so that** I can see where my purchase stands and move on to buying the property.

**Size** M · **Flag** `dd_case_lifecycle` · **Deps** E1-S1 · **Merged** PR #139

**Evidence of the gap**

- `TransactionStatus` declares `DD_IN_PROGRESS` and `DD_COMPLETE` at `prisma/schema.prisma:77`, and until #138 the only code that ever set them was the standalone service.
- `backend/src/verification/verification.service.ts` never references `Transaction` or `TransactionStatus`, so completing verification does not advance the purchase.
- Result: a listing transaction stopped at `DD_PURCHASED` permanently.

**What E1-S1 changed, and what it left.** The transaction now moves. `DdCoreService.createAssignment` sets `DD_IN_PROGRESS` at `backend/src/dd-core/dd-core.service.ts:216` and `applyStatusChange` sets `DD_COMPLETE` at `:246`, on the listing path as well as the standalone one, because that behaviour came out of the standalone service in the extraction rather than being written fresh. So criteria 1 and 2 below were already met in substance when this row was picked up. **The other four were the story**, and they were the harder four. There was no transaction table anywhere, the two writes were two statements and not one atomic unit, a replayed completion re-ran and re-notified, and any status change that was not `COMPLETE` wrote `DD_IN_PROGRESS`, which meant cancelling a case marked its transaction as in progress. That last one was inherited behaviour carried across in the extraction, it was visible in one place, and it was this row's to fix. All four are closed in #139, described under the criteria below.

**Acceptance criteria**

1. Completing the first assignment on a listing DD order moves the transaction to `DD_IN_PROGRESS`.
2. Completing the order with a verdict moves the transaction to `DD_COMPLETE` and notifies the buyer.
3. Transitions are declared in one table and enforced in one place. An illegal transition throws a mapped 409, never a 500.
4. The transition and the order update happen in a single database transaction. A failure after the order update cannot leave the transaction status behind.
5. Replaying the same completion is idempotent and does not re-notify.
6. Tests assert the legal transition set and at least four rejected transitions.

**Delivered** in PR #139. The table is `TRANSACTION_TRANSITIONS` in `backend/src/transactions/transaction-state.constants.ts`, and the one place it is applied is `TransactionStateService.advance`. An illegal move raises `ConflictException`, which Nest maps to 409, and the message names what would have been legal instead of restating what was refused.

The design decision worth reading is that a move is a single conditional write and not a read followed by a write. The legal predecessors travel inside the `where` of an `updateMany`, so the legality check and the write are one statement and two operators signing off in the same second cannot both read `DD_IN_PROGRESS` and both write `DD_COMPLETE`. The row is read only when that write matches nothing, and only to separate the two harmless-looking failures: a transaction already at the status asked for is a replay and returns `changed: false`, and a transaction anywhere else is the 409. The same shape now guards the order row, so criterion 5 holds at the level where the notifications actually are: a replayed sign-off writes nothing, keeps the `completedAt` of the first one and does not tell the buyer twice. Criterion 4 is an interactive `$transaction` in `DdCoreService.applyStatusChange` wrapping the order write and the transaction move together. `CANCELLED` now maps to no transaction status at all through `DD_STATUS_TO_TRANSACTION_STATUS`, so cancelling a case no longer marks its transaction in progress.

**One gap is deliberate and is recorded here rather than left to be found.** The payments, escrow, guest-checkout and standalone writers each set a transaction status directly, and they still do. They are declared in `TRANSACTION_TRANSITIONS`, so the table is complete, but they do not yet go through `advance`. Routing live money paths through the machine is its own story: doing it inside this one would have turned an M into an L and put freshly rewritten writes on the path a buyer's money takes. Until that story exists, "enforced in one place" is true of the due diligence lifecycle and not yet true of the whole `Transaction` table.

---

#### E1-S3, buyer DD report delivery

> **As** a buyer, **I want** to download the due diligence report I paid for, **so that** I have the document I bought and nobody else does.

**Size** M · **Flag** `dd_case_lifecycle` · **Deps** E1-S1, E3-S1 · **Merged** PR #141

**Evidence of the gap**

`DueDiligenceOrder.reportStorageKeys` exists at `prisma/schema.prisma:371`. For listing orders nothing wrote it and nothing read it, and **E1-S1 has closed that half**: the assignee's upload writes the key at `backend/src/dd-core/dd-core.service.ts:268` and `:301`, and the case read serializes a signed URL from it at `backend/src/dd-core/dd-case.serializer.ts:110` and `:167`. What is left for this story is the buyer's own delivery, which is a route they call for their report with the access check on it, an audit row per issued link, and the browser surface that fetches it. Signed URLs remain the weak part on both paths: `getSignedUrl` for the local driver returns a plain unauthenticated `/uploads/{key}` path (`backend/src/storage/storage.service.ts:58` to `:63`), which is why criterion 2 below is a real piece of work and not a configuration line.

**Acceptance criteria**

1. `GET /due-diligence-orders/:id/reports` returns short-lived download links for the owning buyer and for operators with `dd.orders.read`.
2. Links expire in 15 minutes or less and are single-purpose. Sharing an expired link yields 403 from storage, not the file.
3. An unauthenticated request, and a request from a different buyer, both receive 404.
4. Each issued link writes an `AuditLog` row naming the actor, the order, and the key.
5. The buyer due diligence screen shows report availability and download state, including the case where the order is complete but no report was attached.

**Delivered** in PR #141, with the flag off. `GET /due-diligence-orders/:id/reports` is in `DueDiligenceController`, backed by `DueDiligenceCaseService.listReports`, and it answers the owning buyer and any operator holding `dd.orders.read`. That is criterion 1.

**Criterion 2 was the piece of work the gap note predicted, and it did not need a dependency or a migration.** `DocumentGrantService` in `backend/src/storage/document-grant.service.ts` signs a grant with `crypto` alone: an HMAC-SHA256 over the storage key, the actor id and an expiry, keyed off a value derived from `JWT_SECRET`, rendered as `<expiresAtMs>.<base64url signature>` and appended to the private document URL. The ceiling is 15 minutes and the grant is single-purpose in both senses that matter: it names one key, so it opens nothing else, and it names one account, so forwarding it to somebody without a session buys them nothing. `PrivateDocumentController` verifies the grant when one is present and answers **403** past the expiry rather than the bytes. The signature is compared before the expiry is read, deliberately, so a forged token reads as mismatched rather than expired and the route cannot be used as a clock or as a probe for which keys exist; lengths are compared before `timingSafeEqual`, which throws on a mismatch rather than returning false.

**Criterion 3 is two callers with one answer, and the second one took a filter.** A caller who is not the buyer is refused by `loadOwnedCase`, which throws `NotFoundException` rather than `ForbiddenException`, so the shape of the refusal says nothing about whether the id is real. A caller with no session at all would otherwise hear 401 from `JwtAuthGuard`, and `AnonymousNotFoundFilter` converts exactly that case into the same 404, with a byte-identical message. It is mounted on this route and nowhere else, and `due-diligence-reports.spec.ts` asserts the other five handlers on the controller do not carry it, because collapsing 401 into 404 across the controller would cost the product the one message a session that has run out needs to show. A caller presenting a broken or expired token still hears 401. That is a judgement call and it is recorded here rather than left to be found: the alternative was to answer 404 to a stale session too, which would have cost this route its `PermissionsGuard` and told an operator with a lapsed token that their own queue had disappeared.

**Criterion 4 is one row per link rather than one per call**, written through `AuditService` with action `DD_REPORT_LINK_ISSUED`, the actor id, the order id, the storage key as the entity id and the expiry in the payload. Recording the key rather than the order is what lets the trail answer which document was handed out. It is also why this is a route of its own instead of another field on `GET /due-diligence-orders/:id`: folding it in would have written a row every time any screen read a case for any reason, and a trail that records looking cannot answer who downloaded.

**Criterion 5 is `DdReportDownloads` on the buyer's due diligence screen**, and it deliberately does not ask for links on render. Availability comes from the case row the table already holds, so the request that mints credentials and writes audit rows happens only when the buyer asks for it. A case that is complete with nothing attached gets its own sentence rather than an empty cell, because a buyer who has paid cannot otherwise tell a document still being filed from a broken page. `staleTime` and `gcTime` are both zero and a timer flips the panel to expired on the clock, so a page left open offers fresh links instead of dead ones. With `dd_case_lifecycle` off the screen falls back to the session-authorized links it drew before this story, so switching the flag off leaves the page working as it did.

---

#### E1-S4, property purchase step

> **As** a buyer whose due diligence came back clean, **I want** to pay for the property through the platform, **so that** my money sits in escrow rather than going directly to a stranger.

**Size** M · **Flag** `property_purchase` · **Deps** E1-S2 · **Merged** PR #140

**Evidence of the gap**

`src/routes/dashboard.buyer.transactions.tsx:225` gates the property purchase path on `["DD_COMPLETE","PURCHASE_PENDING","PURCHASE_IN_ESCROW","COMPLETED"].includes(tx.status)`. That branch was dead code for as long as nothing reached `DD_COMPLETE` on the listing path. **E1-S1 and E1-S2 have closed that**: sign-off moves the transaction to `DD_COMPLETE` through a single enforcement point, so the gate now has a real status to read, and this row is what makes it lead somewhere. The payment side is ready: `backend/src/payments/payments.service.ts:290` handles `PROPERTY_PURCHASE` and `:317` calls `escrow.hold`. Note that the payment path sets transaction statuses directly rather than through `TransactionStateService`, which E1-S2 recorded as a deliberate gap, so this story should decide whether to route the purchase move through the machine while it is in there.

**Acceptance criteria**

1. The property purchase action appears only when the transaction is `DD_COMPLETE` and the buyer's KYC allows it, per E4-S2.
2. Initiating it moves the transaction to `PURCHASE_PENDING` before the gateway call, so an abandoned checkout is distinguishable from one never started.
3. A successful payment moves the transaction to `PURCHASE_IN_ESCROW` and creates or updates the escrow hold for the full amount, not the deposit.
4. A failed or abandoned payment returns the transaction to `DD_COMPLETE` and leaves no escrow row.
5. The buyer sees the escrow state, the held amount, and the outstanding release conditions.
6. A verdict of concern on the due diligence order blocks the purchase action and shows the reason.

**Technical note.** `src/routes/dashboard.buyer.transactions.tsx:236` to `:237` pays a computed `deposit` for due diligence and the full listing price for purchase, and `:112` and `:254` store and read the payment id from `localStorage`. Move that association server side while this story is open, since a cleared browser currently loses the link between a transaction and its payment.

**Delivered** in PR #140, with the flag off. Whether a buyer may purchase is now one function, `evaluatePurchaseReadiness` in `backend/src/transactions/purchase-readiness.ts`, and both the serializer that draws the button and the endpoint that takes the money read it, so there is no second copy of the rule for a browser to disagree with. Six refusals are declared in `PURCHASE_BLOCK` and checked in a fixed order, each carrying a reason written for the buyer rather than a code: the flag off, due diligence unfinished, a verdict of concern, KYC not approved, an escrow hold already standing, the transaction closed. That covers criteria 1 and 6, and the mapped statuses are part of the design: the flag being off answers 404, so a feature switched off is indistinguishable from one never built; a verdict of concern and a failed KYC answer 403; everything else answers 409, so a buyer who is merely early gets a different answer from a buyer who is refused.

Criteria 2, 3 and 4 are the state machine covering the whole of the payment. `POST /payments/purchase` moves the transaction to `PURCHASE_PENDING` through `TransactionStateService.advance` before it calls the gateway, a verified payment moves it to `PURCHASE_IN_ESCROW` and holds the full listing price rather than the deposit, and a failed or abandoned payment returns it to `DD_COMPLETE` and leaves no escrow row. That last path needed a new edge, `PURCHASE_PENDING` back to `DD_COMPLETE`, in `TRANSACTION_TRANSITIONS`, and a route for the browser to report it, `POST /payments/:id/abandon`, because Paystack says nothing at all when a buyer closes its window. Without that call the transaction would sit pending with no button to try again. Criterion 5 is the escrow panel on the buyer's transaction card, which shows the state, the held amount and each unmet release condition by name, and the empty case says every condition has been met rather than showing nothing.

Two things beyond the criteria are worth recording. There is no amount in the request body and no amount field in `StartPurchaseDto`; the server reads the price off the listing the transaction points at, because a browser that can name its own price is criterion 3 undone rather than a rounding difference. And the technical note above is closed: the payment id now travels on the transaction as `latestPayment`, nothing is written to `localStorage`, and the card's test asserts the store is empty after a render that displays a payment reference, so the association cannot quietly move back into the browser.

---

### Epic E2, money integrity

**Stakeholder value.** Escrow only means something if the money it releases arrives at the right person, and a refund only means something if the buyer gets their money back. Neither is true today.

---

#### E2-S1, seller payout destination

> **As** a seller, **I want** my escrow release to arrive in my own bank account, **so that** selling through the platform actually pays me.

**Size** L · **Flag** `payouts` · **Deps** D2, then EXT-1. E1-S4 was the other story dependency and it merged as #140, so no developer is in front of this row. ADR-0002 decides whether the platform holds client funds, and EXT-1, a live merchant account and a settlement account with a business verification behind it, cannot be started until that answer exists. The decision is the long pole and the account is the lead time behind it

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

**Size** M · **Flag** none · **Deps** E2-S1 (E4-S1 merged as #121)

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

**Size** M · **Flag** none · **Deps** D4, then EXT-2. ADR-0004 decides how a private document is served, and EXT-2, the bucket and the region it is served from, is bought to match the answer rather than before it

**Evidence of the gap**

`backend/src/storage/storage.service.ts:22` to `:30`: when running on Vercel with a relative or unset upload directory, the local root becomes `/tmp/safebuyrealties-uploads`. Vercel serverless `/tmp` does not persist between invocations. `backend/.env.example` lists the S3 variables. This entry used to cite `backend/.env.vercel.prod` as proof that production sets no `STORAGE_DRIVER` and no AWS keys; that file has since been untracked, and it never supported the claim — it holds `VERCEL_*`/`TURBO_*` build metadata and carries no `DATABASE_URL` either, which production certainly has. **The production storage driver is not knowable from this repository and must be read from the Vercel dashboard.** If it is `local`, uploads written in production are effectively write-only.

**Acceptance criteria**

1. `STORAGE_DRIVER=s3` is required in production. The application refuses to start on a serverless platform with the local driver.
2. Bucket policy denies public reads. **Reworded after E3-S1c**: this used to read "all access is through pre-signed URLs from E3-S1", which is now wrong for private families. A pre-signed URL is a bearer capability, an hour of access to whoever holds it with no session and no role check, so it cannot express "the owner and platform operators only". Private keys are read through `PrivateDocumentController`, which authorizes each request and only then asks the driver for the bytes. Pre-signed URLs remain correct for public listing media. `storage.service.spec.ts` configures the s3 driver with no credentials at all and asserts a private key still resolves to the authorized reader, so a future change that presigns one fails the suite.
3. Server-side encryption is enabled and object versioning is on, so an accidental overwrite is recoverable.
4. A one-off migration copies any recoverable existing objects and reports the keys it could not find, rather than failing silently.
5. `docs/LOCAL_DEVELOPMENT.md` documents the local driver as development only.
6. Storage failures raise a mapped 502 with a correlation id, never an unhandled 500.

**What the 2026-08-06 EXT-11 answer changed for this story.** The region half of D4 was deferred because §12 of the client's internal data protection policy and §10 of the published one produced different buckets. That deferral is withdrawn. The Managing Director/CEO and the Board ruled that the internal policy governs and named the mechanism: for non-Nigerian cloud infrastructure, "an NDPC-approved Cross-Border Data Transfer Instrument or standard contractual clauses with the hosting provider and relevant subprocessors". So the region is now a choice rather than a wait, and it is a choice with a price on one side. A **Nigerian region** needs no instrument and this story proceeds the moment the bucket exists. A **non-Nigerian region** cannot carry production data until the instrument is executed, because the ruling's own words are "until executed and documented, no new production transfer should rely on general consent or 'reasonable steps'". **No executed instrument exists in this repository.** That sentence, not EXT-11, is what now gates a non-Nigerian bucket, and it is asked for in the closure schedule at EXT-2 rather than a second time here. Whoever picks this story up reads the region choice off EXT-2 and, if it is not Nigerian, asks for the executed instrument before the first production object is written.

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

**Size** M · **Flag** `kyc_gate` · **Deps** D3, which shaped this row rather than blocking it, because manual review is what ships. E1-S4 was the story dependency · **Merged** PR #142

**Evidence of the gap**

`KycRecord` exists at `prisma/schema.prisma:538` with a full submit and review flow in `backend/src/kyc/`. Outside that module the only reference in the entire backend was a dashboard count at `backend/src/admin/admin.service.ts:38`. **E1-S4 has since made one thing read it**: `evaluatePurchaseReadiness` refuses a property purchase with `KYC_REQUIRED` when the buyer's KYC is not approved, which is the first half of criterion 1 delivered in one place. Nothing else checks KYC before PoA execution or payout, and there is no policy deciding which actions need it, so what this row does now is generalise a pattern that already exists rather than invent one.

**Acceptance criteria**

1. A configurable policy decides which actions require `VERIFIED` KYC. The MVP default is property purchase payment and PoA execution, and not due diligence purchase.
2. A blocked action returns 403 with a machine-readable reason and the frontend routes the buyer to the KYC screen with a return path.
3. The gate is enforced server side. Hiding the button is not sufficient and a test proves the API refuses.
4. Sellers require verified KYC before a payout account can be verified, per E2-S1.
5. Rejected KYC shows the reviewer's note and allows resubmission, and resubmission clears the previous rejection.
6. Behind `kyc_gate`, so the gate can be turned off for a demo without a deploy.

**Delivered** in PR #142, with the flag off, and with criterion 4 declared rather than wired. The policy is `KYC_GATED_ACTIONS` in `backend/src/kyc/kyc-gate.ts`, four actions, each declaring whether an armed gate demands `VERIFIED`, the sentence a buyer reads when it refuses, and the story that owns the answer. `describeKycAction` reports the source alongside the answer, because an action reading *not required* because the gate is disarmed and one reading it because the registry says so look identical to a caller and mean opposite things to an operator about to arm it. That is criteria 1 and 6 together: turning the gate off is a flag, changing which actions it covers is a change to that file and a review, which is the right way round for a policy on a money path.

**The negative half of criterion 1 is the part with a test rather than a comment.** `DUE_DILIGENCE_PURCHASE` declares `requiresVerified: false`, and `payments.service.spec.ts` drives a buyer with no KYC record at all through a due diligence payment with the gate armed and expects it to complete. Due diligence is the step that earns the trust, and demanding identity documents before a buyer has seen anything of value is how the funnel never starts. Everything downstream of it moves real money or signs a real instrument, and `PROPERTY_PURCHASE` and `POA_EXECUTION` both require verification.

**Criterion 2 is a code the frontend routes on, not a sentence it matches.** `KycRequiredException` answers **403** carrying `KYC_REQUIRED` with `details: { action, kycStatus }`, and `PURCHASE_BLOCK.KYC_REQUIRED` is now that same constant rather than a second spelling of it, so one browser code path serves both surfaces. On the frontend, `src/lib/kyc-gate.ts` reads the code and builds the search params, `TransactionCard` and `PoAExecutionScreen` render the link, and `/dashboard/buyer/kyc` takes a `redirect` param through the same `isSafeInternalRedirect` guard `/login` uses, because a search param arrives from the URL bar as readily as from our own link. The check sits in `KycReturnNotice` rather than in the route file, which is what makes it testable at all: route files here export nothing but their `Route`.

**Criterion 3 put the PoA gate further in than a controller.** `assertKycGate("POA_EXECUTION", …)` is in `PoaService.execute`, in front of the PDF generator, so nothing is drafted, hashed or stored for a buyer this platform cannot name, and `poa.service.spec.ts` drives it through the service rather than through a guard. `NOT_SUBMITTED`, `SUBMITTED` and `REJECTED` are all refused: a record sitting in review is not a lesser kind of verified, it is an unanswered question, and letting it through would make the gate something anybody clears by uploading a file.

**Criterion 5 needed no new code, and the tests are the deliverable.** `kycStatusMessage` already returned the reviewer's note on `REJECTED`, `kycCanSubmit` already admitted a resubmission, and `KycService.submit` already nulled `reviewNote`, `reviewerId` and `reviewedAt`. Four tests in `kyc.service.spec.ts` now hold each of those, on the argument that the gate is what makes this load-bearing: before this row a rejection cost a buyer nothing, and after it a rejection that cannot be cleared is a buyer who cannot complete a purchase.

**Criterion 4 is not delivered, and it is not deferrable by this row.** It says a seller needs verified KYC before a payout account can be verified, *per E2-S1*, and E2-S1 has not started: there is no payout destination in this codebase, no verify step and therefore nothing to gate. `SELLER_PAYOUT_ACCOUNT` is declared in the registry with `story: "E2-S1"` and reaches no request, so whoever takes that story finds the policy already made and the wiring is one call to `assertKycGate` on the way into the verify step. E2-S1 waits on ADR-0002.

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

**Size** L · **Flag** `privacy_centre` · **Deps** EXT-5, which now carries what EXT-11 turned into (EXT-11 closed 2026-08-06; E5-S5 merged as #131)

**Evidence of the gap.** No consent model, no retention policy, and no erasure path exist in the schema or the codebase. The platform stores government identity documents, selfies, and professional credentials. The reference project treats the equivalent as `FR-A6` and `FR-A7` with a dedicated privacy centre, and its own `docs/adr/0004-auth-and-account-portal.md` is worth reading before designing this.

**What reading the client's own policy added, 2026-08-05.** `docs/inputs/SB DATA PROTECTION POLICY.docx` is now in the repository and it is stricter and more specific than this story assumed. Four obligations in it are dated or nameable and belong in this scope rather than in a general intention to comply: a licensed **Data Protection Compliance Organisation must be engaged** under §9, which is an engagement and not the NDPC registration this backlog used to call it; an **initial compliance audit within fifteen months** under §10.1, with annual returns by 31 March under §10.2; a **DPIA** under §13, which is unavoidable rather than discretionary because `KycRecord` already stores identity documents; and a **record of processing activities** under §14 which must carry a retention period per purpose. The RoPA is what resolves the retention design: periods are configured per purpose with no default and a loud failure when one is unset, rather than a single global number. §4.5's six months and the financial retention this platform needs are then two entries in that record rather than a contradiction, which is a documentation gap for the DPO to close in writing. Note also that the policy is headed "SUBJECT TO BOARD APPROVAL" and names no DPO, so both are open questions to the client. **And §12 is the one that blocks: it forbids transfer outside Nigeria except on a closed list of three conditions, while the published privacy policy §10 promises only reasonable steps.** That is EXT-11, and until it comes back this story encodes the stricter of the two and lets the tests be the record of which document won.

**What the EXT-11 answer added, 2026-08-06.** The stricter-of-the-two hedge is no longer a hedge. Legal ruled that the **NDPA 2023 and the GAID 2025** govern, both company documents sit under them, and a company document cannot lower a statutory floor, so §12's closed list is the transfer rule and the published policy's "reasonable steps" is not. This story now encodes a rule rather than a guess, and the tests record a ruling rather than a bet. Three things join its scope. **§6.2's higher-standard consent tier for sensitive data** is now named, and `KycRecord` holds identity documents, so consent is two tiers rather than one flow. **§6's bar on consent by inactivity** kills continued browsing and browser settings as consent, so the cookie banner is an affirmative act with no pre-ticked boxes and the withdrawal path is as easy as the giving path, which §6 also requires. **§7.1's Standard Notice to Address Grievance** is a GAID obligation this backlog had never recorded, and SNAG appears nowhere in the repository, so the complaint route is a build item and not a paragraph in a notice. Note what this does not settle: which of the three §12 conditions the running infrastructure meets is still open, so the story can state the rule but cannot yet state the basis, and **the GAID itself is not in `docs/inputs/`**. Scoping the rest of this story against a directive nobody here has read is the risk to flag when it is picked up.

**What the second EXT-11 answer added the same day, and what it closed.** The paragraph above ends on an open question, and that question is now answered. The Managing Director/CEO and the Board of Directors ruled, with Legal and the DPO named as the implementers, that "for the current non-Nigerian cloud infrastructure, the approved mechanism shall be an NDPC-approved Cross-Border Data Transfer Instrument or standard contractual clauses with the hosting provider and relevant subprocessors". That is a choice among the three §12 conditions rather than a restatement of them, so this story can now state the basis and not only the rule. Two of its sentences are build constraints rather than background. **"Until executed and documented, no new production transfer should rely on general consent or 'reasonable steps'"**, which means the consent model this story builds may not be the thing that authorises a transfer, and a design that leans on consent for cross-border processing is wrong before it is written. **"Policy effective date: the official platform go-live date"**, which means the policy is not in force today and is in force the moment the platform is, so anything that has to be true on day one has to be true before go-live rather than after it. The published privacy policy is now a document under instruction to change: where it conflicts, "it must be amended to match the stricter internal policy and governing law", which turns the §10 against §12 clash from a question this story hedges into an amendment somebody owes. **The GAID 2025 copy is still not in `docs/inputs/`.** The ruling names GAID as governing and the directive nobody here has opened is still the directive this story is scoped against, so that risk is unchanged and it is EXT-5 row 8 in the closure schedule.

**Acceptance criteria**

1. Consent is captured at registration with version, timestamp, and source address, and no account exists without a consent row.
2. A published privacy notice is versioned, and a material change re-prompts.
3. Retention periods are declared per data category and enforced by a scheduled sweep, with KYC documents and audit logs given explicit, separately justified periods. No category has a default period, and an unset one fails loudly rather than falling back.
4. Data export returns a user's own data on request.
5. Erasure honours a grace period, blocks deletion where a legal hold applies such as an executed PoA, and crypto-shreds rather than orphaning storage objects.
6. Every privacy action is audited.
7. A record of processing activities exists per DPP §14, and every retention period in criterion 3 is derived from it rather than declared twice.
8. A DPIA covering KYC document storage is completed per DPP §13 and recorded in the repository.
9. Cross-border transfer is enforced to DPP §12's closed list, and a test asserts the rule that was chosen so that a later relaxation is a visible diff rather than a silent one.
10. Cookie consent is an affirmative action, not a browser setting, and continued browsing is not treated as consent. Both are conflicts with the published policy and both are recorded as such.

---

#### E8-S2, legal review of the PoA instrument and terms

**Size** S · **Status** ⛔ blocked on EXT-4 · **Deps** EXT-4

**Evidence of the gap.** `backend/src/poa/poa.service.ts` generates an instrument whose clauses were written in the build checklist, not by counsel. The consent copy in `src/components/PoAExecutionScreen.tsx` includes an irrevocability acknowledgement. The client is a firm of lawyers, and `docs/inputs/client-legal-comments.docx` already asks for a security review.

**Acceptance criteria**

1. Counsel-approved instrument text replaces the current draft, and the version is recorded on every executed record.
2. Terms of service and the privacy notice are approved and versioned.
3. Executed instruments retain the text version in force at execution, so a later revision does not rewrite history.
4. The witnessing and Land Registry registration expectations in the current consent copy are confirmed or corrected by counsel.

**What the 2026-08-06 answers put into this story, 2026-08-06.** Two of the five answers landed here, and between them they added work rather than removed it. **EXT-12 supplied values this story had been guessing at.** The legal entity on every instrument is **Safebuyrealties International Ltd, RC 8483982**, at Suite 404, 4th Floor, 14 Allen Avenue, Centage Plaza, Ikeja, Lagos, and the canonical domain is **`www.safebuyrealtiesltd.com`** with an explicit instruction not to print `safebuyrealties.com` on instruments. The verification URL default at [poa-verify-config.ts:7](../backend/src/config/poa-verify-config.ts#L7) is the wrong domain today, which makes it a correction with a named source rather than a preference. **EXT-10 landed more work than it settled.** Its VAT position is text this story has to carry, and the document heads that text "Recommended counsel position for formal signature", so criterion 1 is not met by it: counsel's signature is still outstanding, and so is CEO, COO and CFO approval of the fee schedule, and so is the wording "commission plus applicable VAT" in the terms of service and the PoA. **A third instrument now exists that did not before.** EXT-9 ruled the commission is two-sided and collected from each party separately, so the buyer's share needs its own instrument or its own clause, and that is drafting nobody has been asked for yet. Note what has not moved: the rate underneath all of this is still contradictory in the answer document, so text quoting a percentage cannot be drafted today. **No agent ticks criterion 1 or criterion 2.** Both need a human signature, and the signatures are counsel's and the client's.

---

#### E8-S3, pre-launch security review

**Size** S to schedule, variable to remediate · **Status** ⛔ blocked on EXT-6 · **Deps** EXT-6 (E4-S3 merged as #125)

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

### Epic E9, financial governance

**What this epic is.** SBR-FIN-DEV-SPEC-20260803-V1.5, committed at `docs/SafeBuy_Financial_Governance_Developer_Implementation_Specification_v1.5_Core_Accounts_Escrow_IDs.docx`, sha256 `49978541698407936fce29e489070dc22fd7fd76e22293084ab3e816f6a22f75`. It defines six main account codes, their sub-codes, how escrow principal is held and reconciled, and which identifiers every financial record must carry. It arrived after this backlog was written, which is why the total in section 1.3 went up rather than down.

**Two gates, and this project only holds one of them.** The CFO approved the specification for implementation, relayed on 2026-08-05. Section 14.2 withholds approval for production activation, which is a separate permission nobody in this repository can grant. **Every story in this epic ships behind `financial_governance`, default off**, and a story is done when it is correct and switched off, not when it is running.

**Rules that apply to every story here, taken from the specification rather than from preference.** Money is `Decimal @db.Decimal(18,2)` or smaller currency units, and floating point is prohibited (section 8.2). Escrow principal is a client-funds liability and never revenue (sections 1.3 and 11.3). Every financial record carries its main code, its sub-code and the applicable SBR IDs (section 8.1). Posted ledger entries, confirmed escrow movements and issued receipts are immutable: a correction is a reversal plus a replacement, never an edit (section 8.2). No release or refund may exceed the verified available escrow balance (section 8.2).

---

#### E9-S1, chart-of-accounts and ID-register tables

**Size** M · **Flag** `financial_governance` · **Deps** none

**Evidence of the gap.** There is no chart of accounts in this codebase. `EscrowService` moves money between statuses on a single table with no account code on any row, so nothing distinguishes escrow principal from commission from VAT, and section 8.1's requirement that every financial record carry its codes cannot be satisfied by any existing column. There is no register of issued identifiers either: `sbr-id.service.ts` mints them from a counter table and nothing records what a given identifier means or which version of the identification standard coded it, which is what makes the location-code defect in `docs/HANDOVER.md` item four unmeasurable from inside the application.

**Delivered.** Three tables, three nullable columns, one flag, and deliberately no behaviour. `id_register` records every identifier with the entity it names, the coding standard that issued it, and the source document and its SHA-256, so a later revision of the standard becomes a dated migration rather than a silent divergence. Rows predating this table default to `LEGACY_PRE_E9`, which labels the existing estate honestly instead of letting a backfill claim compliance it does not have. A reissued identifier is a new row plus a `supersededById` pointer, which is section 8.2's correction rule applied to identity. `main_accounts` and `account_subledgers` carry the shape of the six main codes and their fixed and dynamic sub-codes, **and none of the rows**: the rows are E9-S3 and they cannot be written until EXT-9 and EXT-10 come back. `isLiability` and `ringFenced` are two columns rather than one for the reason ADR-0002 gives. `entityType` is text rather than an enum because five identifier conflicts are open with Digital Records and an enum would freeze one reading of a disputed document into the database. `audit_logs` gains `reason`, `requestId` and `source`, nullable and defaultless, so a reversal says why it happened and one multi-table financial operation reads back as the single thing it was.

This is a migration PR under the project's migration rule, so it carries the schema and the flag declaration and no code that uses them. The migration and its rollback were both rehearsed against a scratch PostgreSQL 14 cluster before this was opened, and the outputs are in the pull request. The `ALTER TABLE` on `audit_logs` sets `lock_timeout = '5s'` and adds nullable defaultless columns, so it is a catalog update rather than a rewrite and it refuses to queue behind a long transaction instead of blocking readers behind it.

Three things were found rather than built, and they are recorded elsewhere in this document rather than fixed here: the location-register discontinuity that makes every property identifier ever issued wrongly coded (EXT-8, and `docs/sql/id-location-code-audit.sql` for whoever has database access), the unauthorised VAT withholding (EXT-10), and the commission basis (EXT-9). ADR-0002 moved to Accepted on the strength of section 11.1, which is what closed decision D2.

**Acceptance criteria**

1. ✅ The migration is additive only: new tables and new nullable columns, nothing dropped and nothing retyped.
2. ✅ The migration applies cleanly to a scratch database at the current production major version, and the rollback runs against the same scratch database before the pull request is opened. Both outputs pasted.
3. ✅ Money columns, when they arrive, have a decimal type available to them and no floating point type is introduced anywhere in the schema by this diff.
4. ✅ `main_accounts` distinguishes an account being held apart from an account being owed, as two columns.
5. ✅ No rate, category or account row is seeded, because the questions that decide them are open.
6. ✅ The `financial_governance` flag exists, defaults off, and names the stories it covers.
7. ✅ Both source documents are pinned by SHA-256 in the migration and in the pull request description.
8. ✅ `validate:tsc`, both test suites and ESLint at zero warnings, pasted in the pull request.

---

#### E9-S2, location register and property ID issuance against the standard

**Size** M · **Flag** `financial_governance` · **Deps** E9-S1, EXT-8, ID Standard Version 2 due 2026-08-13

**Evidence of the gap.** `docs/HANDOVER.md` item four, in full. Section 2.0 rule 7 of the ID Standard requires a property identifier's location segment to come from the property register in section 5.0, which holds 32 Lagos codes. `LOCATION_CODES` in `sbr-id.service.ts` is almost entirely the national register from section 6.0 instead, and Ikoyi, Lekki, Victoria Island, Ajah, Surulere and Yaba all collapse into a single `LOS`. Two entries are wrong in a second way and need different treatment: `IKY` is a collision, emitted only for `/ikorodu/i`, so every `-IKY-` identifier is an Ikorodu record wearing Ikoyi's code and the number of correctly coded Ikoyi identifiers is zero; `IBA` is an orphan, in neither register, where Ibadan is `IBD`. The counts are a named TODO rather than a figure, because nobody on this side has database access, and the queries are committed at `docs/sql/id-location-code-audit.sql` for whoever does.

**Scope discipline.** This story implements **the property register mapping only**. The ID Standard contradicts itself on which register non-property identifiers draw from, so every other location segment stays on its current behaviour behind a named gap until EXT-8 answers. And **re-check the ID Standard's SHA-256 immediately before starting**: a Word lock file beside it says it is open on somebody's machine. If the hash has moved, stop and read the new document rather than diffing it against anyone's memory of the old one.

**Held until 2026-08-13, and the hold moved rather than lifted.** The lock file has an explanation now. Management confirmed on 2026-08-06 that the ID Standard is under controlled revision and that **Version 2 is due 2026-08-13**, with the instruction that "engineering may continue non-disputed foundation work but must not permanently encode disputed rules until Version 2 is approved and issued". The existing 32 Lagos and 38 national code values survive the revision; what changes is which family draws from which register. So this story does not wait on a question any more, it waits on a document with a date on it, and the date is the thing to check rather than an inbox.

**What the 2026-08-06 EXT-8 answer changed in this story.** The register split has a rule: property-related identifiers use the property-location register for the subject property, buyer, seller, professional, general service and administrative identifiers use the national register, and a property-linked case, inspection, escrow or dispute inherits the property location. **That obsoletes criterion 3 below rather than satisfying it**, which is marked in place instead of quietly rewritten, because the criterion was written to keep a gap visible and the gap is now filled by a rule pointing the other way. Three contradictions inside the same answer still forbid encoding: `SUR` against `SVR` for Surveyor, whether a UUID really replaces `NNN` in four formats approved on the same pages, and an ALD format that cannot be validated against as printed. Every one of the three is written into stored identifiers, so guessing is not a rename later.

**Three smaller points came back later the same day and none of them lifts the hold.** The `TYPE` list is closed at BUY, SEL, DD, PRO and PRT with "no others for now", so when this story is written `SBR-SRV-TYPE` can validate against a closed set instead of a list introduced with "including", and "for now" means the set belongs in data rather than in an enum. `SBR-CASE-DD` is approved as a third case type, so the `SBR-CASE-DD-` identifiers this platform has already issued need no disposition and are outside this story's remediation entirely, which is worth knowing before anyone counts rows. A building material seller is coded `ALD` rather than `SUP`. All three were relayed without a name against them and the attribution is outstanding. **The hold is unchanged:** Version 2 on 2026-08-13, and the three contradictions before anything is encoded.

**Acceptance criteria**

1. A `location_register` table holds the codes, each row carrying `source_document` and `source_document_sha`, so every code in the database cites the exact version of the standard it came from.
2. Property identifier issuance resolves its location segment from the property register, and a property address that resolves to no property code fails loudly rather than falling back to `LOS`.
3. ~~Non-property identifiers are unchanged, and a test asserts they are unchanged, so the EXT-8 gap is visible rather than assumed.~~ **Obsolete as of the 2026-08-06 EXT-8 answer, and it has to be rewritten rather than waited on.** This criterion assumes there is no rule for non-property families. Question 4 supplies one, so the criterion now asserts behaviour the decision forbids. Its replacement is a criterion that encodes the family split, and it cannot be written until Version 2 is issued and the three contradictions are resolved.
4. The `IKY` collision and the `IBA` orphan are handled separately: the orphan is rewritten, the collision is reversed and replaced under section 8.2 with a reason on every row.
5. Every reissue writes an `id_register` row pointing at the identifier it supersedes. No identifier is edited in place.
6. The audit queries are re-run after the correction and the before and after counts recorded in `docs/HANDOVER.md`.

---

#### E9-S3, six main accounts, sub-codes, commission and VAT rates, postings

**Size** L · **Flag** `financial_governance` · **Deps** E9-S1, EXT-9, EXT-10

**Evidence of the gap.** The tables exist and are empty. Nothing in the platform posts a coded financial entry, and the rates that would drive one are the subject of two open questions: the commission basis appears in four sources with three readings, and no instrument the seller signs authorises the VAT withholding that section 4's formula and Appendix C's worked example both perform. The gap between the two readings is real money: on Appendix C's NGN 50,000,000 sale the specification pays the seller 47,312,500 and this repository pays 47,500,000.

**This story cannot start on engineering's say-so.** It writes rates down, and writing a rate down is asserting an answer to EXT-9 and EXT-10. Both must come back first.

**Both came back on 2026-08-06 and neither closed, so the sentence above still holds.** What changed is the shape of what is missing. EXT-9 settled the structure: commission is **two-sided**, the buyer's share is **collected from the buyer and must not be withheld from the seller's proceeds**, and it is a **rate with an override** rather than a floor. That is buildable and this story can be designed against it. **The number is not settled**: 5% per side in every response box, 10% per side in every collation row of the same document. And "authorised users" names no role this platform has, so the override needs a named role or permission and a statement of where the approval for a variation is recorded. A per-transaction commission override is a money-moving control, so it ships behind the flag, default off, until Finance, Legal and technical sign-off.

**EXT-10 came back and it overrules an acceptance criterion below.** Finance ruled that VAT must not be withheld from a seller's property-sale proceeds and may only be charged on the commission receivable from each party, which confirms what this repository already does and makes FinGov §4's formula and Appendix C's worked example the documents that are wrong. **Criterion 6 requires a test proving that worked example to the naira**, so as written it would prove the platform does the thing Finance forbade. It is struck below rather than left to be discovered by whoever picks this up. Production VAT automation also carries a condition set by the answer itself: it does not activate until counsel signs the position and the CEO, COO and CFO approve the configuration. **Neither signature exists and no agent may tick either.**

**Acceptance criteria**

1. The six main accounts are seeded with their codes, names and their liability and ring-fencing flags, each row citing the source document and its hash.
2. Fixed sub-codes 11, 12 and 21 to 26 are seeded. Dynamic sub-codes `3-NNNNNN` and `4-NNNNNN` are minted per subject and carry the owner they belong to.
3. Commission and VAT rates are configuration with a recorded effective date, never constants, and every rate cites the instrument that authorises it.
4. Every posting carries its main code, its sub-code and the applicable SBR IDs.
5. Posted entries are immutable. A correction is a reversal plus a replacement, and the reversal carries a reason.
6. Money is decimal end to end. ~~A test proves the Appendix C worked example to the naira.~~ **The second half is overruled by the 2026-08-06 EXT-10 answer and has to be rewritten before this story is picked up.** Appendix C withholds VAT from seller proceeds and Finance has ruled that unauthorised, so a passing test against it would prove the platform does the forbidden thing. Its replacement asserts the ruling: VAT is charged on the commission receivable from each party and no VAT is drawn from the sale proceeds. Write it against the corrected specification once FinGov §4 and Appendix C are amended, and if they have not been amended, the disagreement between the authoritative document and the authoritative decision is itself the blocker.
7. A per-transaction commission override is behind the `financial_governance` flag with a named role or permission on it, and every variation records who approved it and against which transaction. **The role is not yet named**, which is the EXT-9 follow-up rather than a design choice this story gets to make.

---

#### E9-S4, escrow sub-ledger and the section 11.1 reconciliation

**Size** M · **Flag** `financial_governance` · **Deps** E9-S3, E2-S1

**Evidence of the gap.** `EscrowService` holds, releases, refunds and pays out on one table with no account code and no reconciliation. Section 11.1 requires the escrow bank balance to equal the sum of the per-transaction escrow sub-ledgers, which is the obligation that decided ADR-0002 and which nothing in the codebase can currently compute or check.

**Acceptance criteria**

1. Every escrow movement posts to its transaction's dynamic `3-NNNNNN` sub-ledger, and the principal is carried as a liability rather than as income.
2. The section 11.1 equation is computed on demand and on a schedule, and a break is surfaced to Finance rather than logged.
3. No release or refund may exceed the verified available balance, proved by a test that attempts one.
4. Confirmed movements are immutable. A correction is a reversal plus a replacement.
5. The reconciliation reads a real bank balance, which is EXT-1, and degrades to an explicit "unreconciled, no bank feed" state rather than reporting a false match when it is absent.

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

- Developer A owns the loop and the money: E1 in full, then E2, then E2-S5. E1 and E4-S2 are done, so A starts at E2-S1 and waits on ADR-0002 to do it.
- Developer B owns trust, access, and platform: E3 in full, then E4-S1 and E4-S3, then E5, E6, E7.
- They meet at E7-S3, which needs both halves working, and at the go-live gates.
- The only hard cross-dependency is E1-S3 needing E3-S1, so B should land E3-S1 in week one.

**First week, whoever is on shift.** DOCS-1, E2-S4, E5-S2, E6-S1, E3-S4. Five small stories, about four days, and between them they close the worst silent-failure mode in the money path, the credential-reflecting CORS policy, the silently dropped email, and the QR code that has always pointed at a 404.

> **Reconciled 2026-07-31.** The handover week ran this first week and landed four of the five: DOCS-1, E2-S4 (#99), E5-S2 (#97, tightened by E5-S2a #102) and E3-S4 (#98). **E6-S1 is the one that did not**, and it did not because it needs a mail domain the client owns, which is EXT-3 and still outstanding — so the silently dropped email is the one item from this paragraph the next team inherits, and it is waiting on someone outside the repository rather than on a developer. The week also closed **E3-S1**, which is the two-developer plan's only hard cross-dependency and its week-one instruction for developer B: that constraint is now discharged, so B can start anywhere in E3 to E7 and A is no longer gated at E1-S3. What replaces it as the earliest scheduling decision is **E3-S2**, durable object storage, which is still on the critical path and still waits on ADR-0004.
>
> **Reconciled 2026-08-05.** Developer A's line above is out of date in the way that matters: ADR-0002 is answered, so A does not wait on a decision at E2-S1, A waits on the client opening a ring-fenced client-funds account, which is EXT-1. That is a different kind of wait and it should be started now rather than when a developer reaches the story. **E9 slots to developer A as well**, because it is the same subject matter and because its first story is the only startable row in this document: E9-S1 has no dependency, E9-S2 and E9-S3 wait on answers from Digital Records and Finance, and E9-S4 needs the same account E2-S1 does. So A's realistic order is E9-S1, then chase EXT-1 and the E9 escalations, then E2-S1 and E9-S3 whenever the answers land, and E9-S4 last because it needs both. Developer B is unchanged, except that E3-S2's region choice now waits on EXT-11 as well as on ADR-0004, and EXT-11 is with legal rather than with the client.
>
> **Reconciled 2026-08-06.** The last sentence above is now wrong and the rest of the note survives. **EXT-11 came back twice on 2026-08-06 and closed**, so E3-S2's region choice no longer waits on it. It waits on ADR-0004 and on somebody choosing, and if the choice is a non-Nigerian region it waits on an executed Cross-Border Data Transfer Instrument that does not exist yet. That is a shorter chain for developer B than the note above describes, and the request sits with the client and the hosting provider rather than with legal. **Developer A's chase list got shorter and A's startable list did not.** EXT-8 and EXT-9 both came back the same day and neither closed, so E9-S2 and E9-S3 are still not startable: E9-S2 now waits on ID Standard Version 2, due 2026-08-13, and E9-S3 waits on a rate that the answer document states two ways. What changed for A is that chasing EXT-8 and EXT-9 is no longer chasing an answer, it is chasing three specific corrections, which is a smaller ask of a busier person. **The ordering advice stands unchanged**, because nothing in the five answers made a new row startable.

---

## 7. What this backlog does not cover

Deliberately out of scope for MVP, carried forward as a Phase 2 statement of work, consistent with the bucketing in `docs/analysis/05_STRATEGIC_RECOMMENDATIONS.md` §1.3 and §1.4:

Agent and broker role with leads, offers, and commission. In-app messaging and case chat. Support ticketing. Seller, agent, and business analytics beyond the finance reconciliation in E2-S5. Saved searches and map-based discovery. Professional earnings and fee disbursement. Flutterwave as a second gateway, noting that `PlatformConfig.flutterwaveEnabled` exists in the schema with no adapter behind it. Two-factor authentication for staff and admin. Build-phase professional orchestration. AI document verification and fraud indicators. A mobile field application.

Each is cleanly extractable from the current architecture, which is the strongest thing this codebase has going for it.
