# SafeBuyRealties — Build Checklist

> **⚠️ ACCURACY NOTICE, added 2026-07-29 during handover.**
> This file previously read `[x]` on every item, including work that is **not** in the code. A line-by-line
> audit against `main` @ `fc05e1e` found seven of them, and they are corrected in the
> **[Audit corrections](#audit-corrections-2026-07-29)** table below rather than by a marker on the item.
> The corrections are not failures of the build, they are gaps between two similar features (standalone
> due diligence is complete, listing-based due diligence is not).
>
> **Do not treat this file as the work queue any more.** The current queue is
> **[`docs/MVP_OUTSTANDING_BACKLOG.md`](MVP_OUTSTANDING_BACKLOG.md)**, which carries acceptance criteria and a
> file-and-line citation behind every claimed gap. This file is retained as the history of what was built and when.
>
> Re-checked against `main` on 2026-08-02 by **DOCS-4**. The seven corrections still stand as written, and
> the stories that close them are the ones named in the table's last column.

This is the historical record of development progress. For what remains, read `MVP_OUTSTANDING_BACKLOG.md`.

**Legend:**

- `[x]` = Built and validated ✓
- `[ ]` = Not started
- `[~]` = In progress

Every item in this file is `[x]`, and none of them are `[ ]` or `[~]`. That is what "historical record"
means here: the file records that the original build finished, not that there is nothing left to do.

**An agent should not start here.** The instruction this file used to carry, read it first and continue
from the first unchecked box, would now find no unchecked box and conclude the project is finished.
Read **[`docs/MVP_OUTSTANDING_BACKLOG.md`](MVP_OUTSTANDING_BACKLOG.md)** and
**[`docs/AGENT_PROMPT.md`](AGENT_PROMPT.md)** instead.

**Validation (local-first):** Run backend + frontend locally against the **shared cloud Postgres** — see `docs/LOCAL_DEVELOPMENT.md`. API base: `http://localhost:3001/api/v1`; app: `http://localhost:8080`. Optional post-merge checks: `docs/VERCEL_VALIDATION.md`.

**How we build:** TDD + PR + CI — see `docs/DEVELOPMENT_GUIDE.md`. Full-stack items need API **and** UI verification on **local** stack before `[x]`.

---

## Audit corrections (2026-07-29)

Seven items below are checked `[x]` and were genuinely built, but a reader reasonably infers something from them
that is not true. Each is listed with what the code actually does and the story that closes it. **None of these
are regressions.** They are places where the checklist item was satisfied literally and the user-facing outcome
was not reached.

| Step | Item | What the code actually does | Story |
| --- | --- | --- | --- |
| 2 | Object storage service | Built and correct, but `STORAGE_DRIVER` defaults to `local` (`storage.service.ts:40`) and production sets no S3 config, so on Vercel uploads write to ephemeral `/tmp` (`storage.service.ts:22`) and do not survive the request | E3-S2 |
| 6 | PoA QR encodes `safebuyrealties.com/verify?hash=` | Backend is complete and `GET /poa/verify` works. **There is no `/verify` route in `src/routes/`**, so every QR ever generated points at a 404 | E3-S4 |
| 7 | `initiatePayout` calls Paystack Transfer API | It does, but the destination is `PAYSTACK_PAYOUT_BANK_CODE` / `PAYSTACK_PAYOUT_ACCOUNT_NUMBER`, defaulting to Paystack's test account `057 / 0000000000` (`paystack.service.ts:119`). **Every seller payout goes to the same account.** No seller bank account exists in the schema | E2-S1 |
| 7 | `refund()` transitions to REFUNDED | Ledger only. It updates the row, resets the listing and notifies, and **never calls the gateway**, so the buyer is not repaid | E2-S3 |
| 8 | Notifications triggered from events | In-app rows only. `EmailService.dispatch()` returns early when `SMTP_HOST` is unset, and no environment defines it, so the guest DD receipt carrying the Service ID is silently dropped | E6-S1, E6-S2 |
| 9 | KYC model, submission, staff review | **Closed.** All built, and it stayed unread for a long time: E1-S4 (#140) made the first thing read it, and outside `src/kyc/` the only other backend reference was a dashboard count. E4-S2 (#142) turned that one refusal into a policy. `backend/src/kyc/kyc-gate.ts` names every action that needs a verified identity, including the one it deliberately answers no on, and every gated path calls the same function. A refusal is 403 with `KYC_REQUIRED` and the action in it, so the buyer's browser can route to the KYC screen and back rather than matching on a sentence. `kyc_gate` is off, so production behaves as it did | E4-S2, merged |
| 10 | DD purchase wizard, 7 steps | **Closed.** The wizard was complete and took payment into a `DueDiligenceOrder` that went nowhere. It now has the whole chain behind it: E1-S1 (#138) added the queue, the assignment, the report and the completion, E1-S2 (#139) put one transition table and one enforcement point behind the transaction beside it, E1-S4 (#140) wired the property purchase to that machine, and E1-S3 (#141) delivered the report to the buyer who paid for it, on a route of their own with links that expire in fifteen minutes and open for one account. What is left is not code: `dd_case_lifecycle` is off, so turning the chain on in production is a decision | E1-S1 to E1-S4, all merged |

### Never on this checklist, and needed before real users

Rate limiting, CORS allow-list (the API currently reflects any origin with credentials), password reset, email
verification on self-registration, session revocation, payment webhook replay protection, privilege enforcement on
the API (privileges gate menus, not endpoints), authorized document access (`/uploads` is served unauthenticated),
upload type validation, structured logging, coverage thresholds, end-to-end tests in CI, and NDPR consent and
erasure. All are stories in `MVP_OUTSTANDING_BACKLOG.md` with acceptance criteria.

---

## Last Session Notes

> *(Each session updates this section before stopping)*

- **Date:** 2026-08-06
- **Tool:** one developer running AI agents, with a second developer reviewing and merging, across the handover week, then waves 1 to 5
- **Last completed:** **no story, and that is the honest reading of the day.** Nothing on the board was startable, so the session did the two things that do not need an answer from anyone. The first is a characterisation test for `SbrIdService`, opened as its own pull request, test-only and changing no behaviour. It pins what the service does **today**, including the two mappings we already believe are wrong, marked as such in the file so nobody tidies them away: `Ikorodu` to `IKY`, which collides with a national code, and `Ibadan` to `IBA`, which is an orphan. It also pins the LOS catch-all, the unmatched default, first-match-wins by table order, and the sequence overflowing silently past 999. Its absence is why the `IKY` mapping survived this long, and its presence is what makes E9-S2 a diff rather than a rewrite: a failure in that file after E9-S2 is expected, a failure before it is a regression. The second is that **EXT-8 to EXT-12 were written out and committed** at `docs/escalations/2026-08-06-ext-8-and-ext-12.md` rather than left in a drafting buffer. These go to people outside the team and come back days later, so the question has to be on record to check the answer against, and the data protection policy §12 wants an audit trail anyway. Writing them is also what found the sharper version of the category conflict: **the platform's enum crosses the ID Standard rather than sitting inside it**, carrying BUILDER and QUANTITY\_SURVEYOR, which the standard cannot issue identifiers for, and lacking Estate Agent, which both controlling documents code. `AGT` and `VAL` turn out to appear in no published document at all, and the published nine is the enum's seven minus VALUER plus the three uncoded trades, which suggests the enum was built from the marketing prose and never from the standard. `SUR` also means Surveyor in §4.0 and Surulere in §5.0 of the same document, which is the fifth conflict the count always claimed and the enumeration never listed. **A third thing was added later the same day and it needed an answer from nobody either:** EXT-1 to EXT-6 have blocked this project for weeks on the strength of a row in a table, and a row is not something a stakeholder can answer, so the ask behind each of them is now written down at `docs/escalations/2026-08-06-closure-schedule.md` with the stakeholder-facing form beside it at `ENG-CS-2026-08-06-01_Closure_Schedule.docx`. Neither has been dispatched
- **Previously:** E9-S1, the foundation tables for financial governance, and it is deliberately the dull half of the epic: three tables and no rate, no sub-code and no posting anywhere in the diff. An approved specification, SBR-FIN-DEV-SPEC-20260803-V1.5, arrived from outside this repository on 2026-08-05 and opened a ninth epic, which is why the backlog went up rather than down for the first time since the handover week began. The migration `20260805120000_fingov_foundation_id_register_and_accounts` is additive only: `id_register`, which records what every identifier issued was coded against and cites the source document and its SHA-256 so a later revision of the standard becomes a dated migration rather than a silent divergence; `main_accounts`, carrying `isLiability` and `ringFenced` as two separate columns rather than one flag, because an account held apart and an account owed to somebody are different claims and collapsing them would let a future account be ring-fenced and counted as income at the same time; `account_subledgers` for the dynamic escrow and professional codes; and three nullable columns on `audit_logs`. Nothing is dropped, nothing is retyped, no column any deployed code reads is touched, and `lock_timeout` is set to five seconds so a lock this migration cannot get fails fast rather than queues behind production traffic. It was rehearsed against a scratch PostgreSQL 14 cluster and the rollback was executed there before the pull request was opened, both outputs pasted into it. **What is deliberately absent is the point of the story.** No rate is written down, because the commission figure appears in four sources with three readings and no instrument the seller signs authorises the VAT withholding the specification's own formula assumes, and a table with no number in it is not blocked by either. **ADR-0002 is Accepted as part of this**, answered by what the specification requires in order to be implementable rather than by an opinion relayed second hand, and the whole thing ships behind `financial_governance`, default off, because section 14.2 withholds production activation as a second gate separate from the approval to build. Reading the two specifications against each other to size the epic is what produced item four of `HANDOVER.md`, that every SBR identifier ever issued is coded against the national register where the standard requires the property register, with the two queries that size it committed at `docs/sql/id-location-code-audit.sql` for whoever has database access
- **Before that:** DOCS-9, the fourth edition of `docs/reports/remaining-work.html`, re-derived from the board rather than edited from the third edition, and the dependency columns that turned out to disagree with it. The report now reads fourteen stories and forty-four developer-days against sixty board rows of which forty-six are closed, and the green group it used to open with, the five stories nobody was blocking, is gone because all five were built in two calendar days as #138 to #142. Re-deriving it is what found the rest. Seven rows in the backlog's epic table still named a dependency that had already merged, or one that was not written down anywhere a reader could act on: `E2-S1` on `E1-S4` (#140), `E2-S5` on `E4-S1` (#121), `E8-S1` on `E5-S5` (#131), `E8-S3` on `E4-S3` (#125), `E8-S2` and `E8-S3` on the bare word `external`, and `E6-S1` on `none` while its own story body already said it waits for SMTP credentials. Every one of them now names the external item that actually holds it, EXT-1 to EXT-6, and four rows that read as startable are marked blocked. `npm run validate:board` did not catch this and could not: it checks that the tiles, the day cards, the header and the queue agree with the rows, and a dependency token that is not another story id is never validated against anything. The number that moved is the one a reader acts on, rows a developer can start alone, which now reads zero and is zero
- **And before that:** E4-S2, the KYC gate on money-moving actions, and it is one registry rather than a rule per handler. `backend/src/kyc/kyc-gate.ts` lists the four actions that could need a verified identity and says yes or no to each in one place, so the answer to "does this need KYC" is looked up rather than re-argued. Property purchase and PoA execution require it. Due diligence purchase deliberately does not, because that is the step that gets a stranger their first piece of value and gating it would cost the platform the funnel, and the "no" has a test on it so nobody adds it back by tidying. A refusal is a 403 carrying `KYC_REQUIRED`, the action and the buyer's current status, and the frontend routes on the code rather than on the message: it sends the buyer to `/dashboard/buyer/kyc?redirect=<where they were>`, checks that path is internal before using it, and offers the way back once the record is verified. The gate sits in the service rather than a controller, so the PoA path is refused before a document is generated and not merely before a button is drawn, and the test that proves it calls the service directly. Rejection already showed the reviewer's note and already allowed resubmission; the gate is what makes that load-bearing, so it now has tests holding it there. `kyc_gate` is off, so production behaves as it did. **Criterion 4 is not delivered:** it asks that a seller hold verified KYC before a payout account can be verified, and there is no payout destination in this codebase to gate. E2-S1 builds one and waits on ADR-0002, so the action is written into the registry as `SELLER_PAYOUT_ACCOUNT` against that story and reaches no request until it does
- **Done this session, 2026-08-06:** five pull requests and none of them delivers a story. #145 is the characterisation spec, test-only, carrying both Rule 8 escape hatches because no row changes state and nothing is unblocked by it. #146 committed the escalations out of a drafting buffer. #147 added the thing that actually gets sent, `docs/escalations/ENG-DR-2026-08-06-01_Decision_Request.docx`, twelve pages with a response box under every question and a collation sheet, plus a `README.md` for the directory and a dispatch table with a column that stays empty until each item leaves. The fourth is the smallest diff of the five, because all it does is fill that column: **EXT-8 to EXT-12 went out on 2026-08-06**, all five together inside one decision request, whose cover asked for a reply by close of business the same day. No counter on the board moves, because a question going out starts a clock rather than closing a row. **The third pull request existed because the second one lied, and it is worth naming why:** #146 left the backlog and the board saying the escalations had been sent while the escalations file itself said they were awaiting review, so three record documents disagreed about one fact and two of them were ahead of it. #147 pulled all three back to approved and cleared to send; this one moves them to dispatched, which is now true and was stamped on the day rather than recalled later. **The distinction that whole exercise was for survives the send:** the dispatch table carries a second column, Answer recorded, and every cell in it is empty. Sending is not answering, and the gap between the two columns is the only honest picture of where the project is. **What the day cost is also worth naming:** the enumeration under EXT-8 said five conflicts and listed four in all three record documents, because the lead sentence and item four were the same conflict written twice. It now lists five and `SUR` is the fifth, kept rather than footnoted, since five items honestly enumerated beat four plus an apology. **The fifth pull request is this one, and it does for EXT-1 to EXT-6 what the second and third did for EXT-8 to EXT-12:** it writes the ask down. Those six have blocked the project for weeks on the strength of a row in a table, and nobody could have answered a row. The record is `docs/escalations/2026-08-06-closure-schedule.md` and the stakeholder-facing form is `ENG-CS-2026-08-06-01_Closure_Schedule.docx`, a new series because `ENG-DR-2026-08-06-02` is already reserved by the cover of `-01` for a revision of `-01` and a reference number is spent when it is issued. It carries ADR-0003 and ADR-0004, which describe behaviour already running while both records still say Proposed, and D3, which has no ADR at all. **ADR-0005 is deliberately excluded at the requester's instruction**, and the schedule says so in its own text rather than omitting it silently. Every cell of its dispatch table is empty, so no counter moves. **Writing it is what turned three rows into findings.** EXT-4 is three documents rather than two: the third is the Power of Attorney this platform generates at `backend/src/poa/poa.service.ts` lines 103 to 159, whose clauses were written in a build checklist and which counsel has never read, and the question inside it is whether an instrument granting authority over land can be executed electronically at all, because if it cannot then E8-S2 is a build change and not a wording change. EXT-5 is not a missing policy: both documents are in the repository and both are structurally complete, so what is missing is board adoption, a named DPO, a licensed compliance organisation, the commencement date the fifteen-month audit clock in §10.1 runs from, and a retention period for each of eight data categories, since neither document states a period in days or years for anything. EXT-6 is the only item with nothing upstream of it and could be booked today, and it is the re-test letter rather than the first report that closes G5. **Two things in the diff are corrections rather than additions.** The board labelled ADR-0003 as D3, which it is not: D3 in the register is the KYC decision and it has no ADR, so a genuinely open decision appeared in no list on that page. And the board said ADR-0003 and ADR-0005 were answered while both files say Proposed. Both are corrected with dated notes rather than silently rewritten
- **Done in the 2026-08-05 session:** 46 pull requests merged across the week and the waves, and wave 5 is one row. Five client documents are now committed alongside it, the Financial Governance specification at `docs/` and four source instruments under `docs/inputs/`, so the documents this epic is built against are in the repository rather than in an inbox, and `.gitignore` gained rules for Word and LibreOffice lock files because reading them produces one every time. **The reading is worth more than the tables this session.** Twelve external items now sit on the board where there were seven, and all five of the new ones came out of holding two specifications against each other rather than out of building anything: five conflicts between the ID Standard and the Financial Governance specification go to Digital Records, led by the fact that the published terms of service offer users professional categories the platform cannot issue an identifier for; the commission rate and the VAT authority go to Finance, the second of them jointly with counsel because it may be a drafting change to the Power of Attorney rather than a configuration value; the data residency conflict goes to legal as blocking, because the client's internal policy and its published privacy notice give different answers and ADR-0004's region cannot be chosen between them; and the domain and entity-name question goes to management, with further instrument generation frozen until it is answered, because a Power of Attorney carries a QR code pointing at a domain no client document names and those cannot be recalled once issued
- **Next:** **the closure schedule has to be sent, and sending it is a person's action rather than an agent's.** `ENG-CS-2026-08-06-01_Closure_Schedule.docx` is written and not dispatched, and until somebody sends it the correct state of the record is the one it is in now, an empty Dispatched column and an empty Answer recorded column beside it. When it goes out the date is stamped on the day and never recalled later, in `docs/escalations/2026-08-06-closure-schedule.md` and in the same commit as any board or backlog sentence that depends on it. **Its cover asks for a response by close of business today, 2026-08-06**, set while it was still drafting rather than left as a blank for the sender to fill in, which is an edit in place and is allowed to be one: the freeze on a sent document exists to protect somebody holding a copy, and nobody is holding this one. The moment a date lands in the Dispatched column that stops being true and a change becomes `ENG-CS-2026-08-06-02`, authored fresh. **A response deadline is also not a dispatch date and must not be recorded as one:** if close of business passes with the schedule unsent, the dispatch table stays empty and the deadline is the thing that moves. **The other half of what is next has not changed: still nothing a developer can start alone, and what the project waits on is now five answers rather than five messages.** EXT-8 to EXT-12 went out on 2026-08-06 and asked for a reply by close of business that same day. Nothing had come back when this was written. **The next action is recording replies, not chasing them into prose:** each answer goes into `docs/escalations/2026-08-06-ext-8-and-ext-12.md` under the question it answers, with the date and who gave it, and the Answer recorded cell gets filled at the same time. A deadline passing is not an event that file records, and it must not become one: if close of business goes by with nothing back, the correct state of the record is unchanged, five dispatch dates and five empty answer cells, and the follow-up is a message to the recipients rather than an edit to any document here. The one that unblocks work soonest is the smallest: EXT-12 asks management whether the ID Standard is under revision, yes or no, and that single word is what stands between the team and starting E9-S2, because the story encodes 32 Lagos codes and 38 national ones straight out of a document that is currently open on somebody's machine. Do not start E9-S2 before it comes back, and do not supersede any existing identifier when it does: that is a scoping call for Digital Records, informed by an audit nobody in this repository can run, and it is not in E9-S2's scope either way. The older framing still holds under it: **nothing a developer can start alone, for the second time, and this time the list got longer while it was empty.** Seventeen stories are left on the board and every one of them waits on a decision, an external party, or a story that does. The move that unblocks the most is not a decision any more and is no longer a set of messages either, since those have gone; it is five replies: EXT-8 and EXT-12 stand in front of E9-S2, EXT-9 and EXT-10 in front of E9-S3, EXT-11 in front of ADR-0004 and the three rows behind it, and EXT-1 in front of E2-S1, which is still what stands between this platform and a real seller being paid. EXT-3, a mail domain, remains the cheapest thing on the list and holds thirteen developer-days on its own. Everything outstanding is in §4 of `MVP_OUTSTANDING_BACKLOG.md` with acceptance criteria and a citation behind each claimed gap
- **Blockers:** three decisions on the list, ADR-0003 to ADR-0005, of which only ADR-0004 holds any rows, and it is now blocked itself rather than merely undecided, by EXT-11. Twelve external engagements, EXT-1 to EXT-12. **ADR-0002 is answered and EXT-7 is discharged**, but answering it released nothing: E2-S1 grew from a bank-details form into a regulated flow with reconciliation, CBN and AML duties, and its eleven developer-days moved to EXT-1 whole. There is also a second gate nobody in this repository can close: section 14.2 of the approved specification withholds production activation separately from the approval to build, so `financial_governance` stays off no matter how much of E9 is written. D3, manual KYC review or a provider, got cheaper to answer late rather than more urgent: E4-S2 shipped on manual review and reads one field through one registry, so a provider changes who writes `KycRecord.status` and not who reads it. **EXT-1 to EXT-6 are no longer blocked on nobody having written the ask down, and that is the only thing about them that changed.** The schedule saying what each needs is written and not sent, so all six still hold every day they held before: EXT-1 in front of E2-S1, EXT-3 holding thirteen developer-days on a mail domain, EXT-4 now three documents rather than two with an unanswered question about electronic execution inside the third, EXT-5 waiting on five things that are decisions rather than drafting plus a retention period for each of eight data categories, and EXT-6 needing a booking rather than a test. **All three of ADR-0003, ADR-0004 and ADR-0005 read Proposed in their own files**, which is why two of them are in the schedule as ratifications of behaviour already running rather than as questions

### Prior session, the handover audit

- **Date:** 2026-07-29
- **Tool:** Claude (Cowork) — handover audit
- **Last completed:** Full code audit of `main` @ `fc05e1e`; this checklist reconciled against it
- **Done this session:** Produced `MVP_OUTSTANDING_BACKLOG.md` (36 stories, cited evidence) and `HANDOVER.md`; recorded seven overstatements in the Audit corrections table above; bannered the stale analysis documents
- **Next:** Work `MVP_OUTSTANDING_BACKLOG.md`, not this file. Start with DOCS-1, E2-S4, E5-S2, E3-S4. All four have since merged
- **Blockers:** decisions D1 and D2 in the backlog gate epics E1 and E2

### Prior session, the unified admin portal

- **Date:** 2026-07-24
- **Tool:** Cursor (Cloud Agent) — unified admin portal
- **Last completed:** Step 13 corrected — single admin portal + named roles/privileges
- **Done this session:** Merged staff/admin/super-admin into one `/dashboard/admin` portal; `AdminRole` privilege sets; Roles & Privileges UI; legacy `/dashboard/staff` redirects; E2E 12/12
- **Next:** Optional — assign AdminRole when editing existing users in UI; remove obsolete staff page files
- **Blockers:** none

---

## Step 13 — Multi-portal auth + Admin CMS (Platform management)

- [x] **Separate login portals** (buyer / seller / professional / admin)
- [x] **Unified admin portal** (not separate staff vs admin dashboards)
  - All company operators (`staff` / `admin` / `super_admin`) land on `/dashboard/admin`
  - Ops pages moved under `/dashboard/admin/*` (submissions, workflow, KYC, DD, inspections, …)
  - Legacy `/dashboard/staff/*` and `/dashboard/super-admin` redirect into admin
  - Sidebar shows operator **name + named AdminRole**
- [x] **Named AdminRoles + privilege catalog**
  - `AdminRole` model; privileges unlock specific nav sections
  - Super admin manages roles at `/dashboard/admin/roles`
  - Create user can assign portal role + privileges
  - Seeded: Super Administrator, Platform Administrator, Operations Officer, Due Diligence Lead, Finance Manager, Content Manager
- [x] **E2E** — `node scripts/e2e-portals.mjs` (buyer/seller/pro + content/finance/ops in unified portal)

---

## Step 12 — Standalone Due Diligence + Professional Onboarding (Demo P0)

### Shared foundation

- [x] **Schema — standalone DD + pro docs**
  - `ExternalProperty` model; `Transaction.listingId` / `ServiceRequest.listingId` optional; `source` LISTING|STANDALONE
  - `DueDiligenceOrder` gains listing/externalProperty, caseId, verdict, reportStorageKeys, staffNotes, COMPLETE lifecycle fields
  - `ProfessionalProfile.licenseDocumentKey` + `idDocumentKey`
  - Migration: `20260717210000_standalone_dd_and_pro_docs`

### Track A — Standalone Due Diligence

- [x] **Catalog — Schedules A–D + Full DD bundle**
  - Rename/align guest check items to Schedule A Legal / B Environmental / C Physical / D Security (keep codes `LEGAL_CHECK` etc.)
  - Ensure `FULL_DD_BUNDLE` (or equivalent) with A+B+C+D exists and is active
  - Validation: `GET /service-catalog/items` + `bundles` show schedules

- [x] **API — standalone DD create + pay (guest + auth)**
  - New module or extend guest-checkout: `POST /standalone-dd/orders` accepts external property fields OR listingId, schedule itemIds/bundleId, guest/auth client info
  - Creates `ExternalProperty` when off-platform; `ServiceRequest` with `source=STANDALONE`; Paystack `DD_SERVICE` without forcing listing UNDER_OFFER
  - On pay: Transaction with `source=STANDALONE`, `listingId` null when external; DueDiligenceOrder `PAID`
  - Validation: unit tests + curl create/pay path

- [x] **API — staff/client DD case lifecycle**
  - `GET /standalone-dd/orders` (buyer mine / staff all)
  - `GET /standalone-dd/orders/:id`
  - Staff: `PATCH` status IN_PROGRESS → COMPLETE with verdict + report upload
  - Validation: staff completes case; buyer sees COMPLETE + verdict

- [x] **UI — `/due-diligence` landing + request wizard**
  - Marketing landing + wizard: property source (listing vs external) → schedules → contact → pay
  - Buyer dashboard cases list; staff DD queue
  - Validation: local E2E off-platform guest path on :8080

### Track B — Professional onboarding E2E

- [x] **API — pro credential document upload**
  - `POST /professionals/me/documents` (license + id) via StorageService (mirror KYC upload pattern)
  - Extend profile DTO/serialize with document keys; require docs before staff can approve (or soft-require for demo)
  - Validation: upload + profile returns keys

- [x] **UI — pro onboarding wizard + gate**
  - `/onboarding/professional` multi-step; redirect incomplete/pending pros from dashboard
  - Credentials page supports document upload + rejection resubmit UX
  - Validation: new pro register → submit → pending state

- [x] **Staff review polish + seed**
  - Staff credentials queue shows docs; approve/reject notifies pro
  - Seed: lawyer/surveyor/valuer all VERIFIED with profiles; optional pending pro for review demo
  - Validation: staff verifies; pro becomes assignable to a task

---

## Step 1 — Fix the Crashes

These four issues cause dashboard screens to crash on load. Fix them before anything else. Nothing can be demonstrated to the client until these are done.

- [x] **Professional dashboard — missing `useTaskKpiCounts` hook**
  - File to edit: `src/hooks/use-tasks.ts`
  - Add an exported function `useTaskKpiCounts()` that calls the existing `useMyTasksQuery()` internally and returns `{ pending: number, inProgress: number, completed: number, isLoading: boolean }` by filtering tasks by their status field
  - Validation: run `npx tsc --noEmit` (zero errors), navigate to `/dashboard/professional` — page must load without a console error

- [x] **Professional task list — same missing hook crash**
  - File to edit: `src/routes/dashboard.professional.tasks.tsx`
  - The same missing `useTaskKpiCounts` export from the item above causes this crash too — once the hook is added in the item above, confirm this route also loads
  - Validation: navigate to `/dashboard/professional/tasks` — page must load without a console error

- [x] **Staff workflow — two missing hooks**
  - File to edit: `src/hooks/use-tasks.ts` and `src/routes/dashboard.staff.workflow.tsx`
  - Part A: Add `useCreateTaskMutation()` export to `use-tasks.ts`. It should POST to `/tasks` with body `{ listingId, assigneeId, title, type, description }` and invalidate the tasks query on success
  - Part B: In `dashboard.staff.workflow.tsx`, find every reference to `patchStepMutation` and replace with the correct `usePatchVerificationStepMutation` from `@/hooks/use-verification` (already exported there). The mutation signature is `{ stepId, listingId, body: { status?, notes?, riskFlags? } }`
  - Validation: run `npx tsc --noEmit` (zero errors), navigate to `/dashboard/staff/workflow` — page must load, the assign action must be clickable without crashing

- [x] **Staff submissions — approve button crashes on click**
  - File to edit: `src/routes/dashboard.staff.submissions.tsx`
  - Add missing import: `import { useUpdateListingMutation } from "@/hooks/use-update-listing"`
  - Instantiate it: `const updateListing = useUpdateListingMutation()`
  - Define the `approve` function that maps current status to next status (`PENDING_REVIEW → ASSIGNED`, `IN_VERIFICATION → VERIFIED`, `VERIFIED → LIVE`) and calls `updateListing.mutate({ id, body: { status: nextStatus } })`
  - Validation: navigate to `/dashboard/staff/submissions`, click the approve button on a listing — it must trigger an API call (check network tab) and the listing status must update

- [x] **CI type-check gate**
  - Create `.github/workflows/ci.yml`
  - Must run `npx tsc --noEmit` on the frontend and `npx tsc --noEmit` in `backend/` on every push and PR
  - Also run `npx eslint src --max-warnings 0` on the frontend
  - Validation: push a branch — the Actions tab on GitHub must show the workflow running and passing

---

## Step 2 — Foundation Infrastructure

These are building blocks that other features depend on. Build them in order.

- [x] **Prisma schema — listing spec and media fields** (PR #25)
  - `Listing` spec fields + `ListingMedia` / `ListingMediaType`; migration `20260525143000_listing_spec_and_media`
  - Tests: `backend/src/listings/listings.service.spec.ts`
  - Validated: production deploy migrate OK (`dpl_5MCjDEtMJThyHSHQ4nEpTeeHYRuq`)

- [x] **Object storage service** (PR #27, #28; checklist closure PR)
  - `backend/src/storage/storage.service.ts`, `storage.module.ts` — `STORAGE_DRIVER` (`local` default, `s3`); local uses `STORAGE_LOCAL_PATH` / `UPLOAD_DIR` (Vercel: `/tmp/safebuyrealties-uploads` when relative)
  - S3: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`; env `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_ENDPOINT`
  - Methods: `upload`, `getSignedUrl` (local → `/uploads/{key}`), `delete`
  - `DocumentsService.createFromUpload` uses `StorageService.upload` (no `fs.writeFileSync`)
  - Tests: `backend/src/storage/storage.service.spec.ts`, `backend/src/documents/documents.service.spec.ts`
  - Validated: `npm run validate:tsc`, `npm test` (3 FE), `cd backend && npm test` (10 BE), `npm run smoke:api`; production `POST /documents/upload` as seller → `storageKey` under `listings/{id}/…`, `GET /documents/listing/{id}` lists new doc (`2026-05-26`)

- [x] **Audit logging** (PR `cursor/audit-logging-e68d`)
  - `AuditLog` model + migration `20260526120000_audit_log`; indexes on `[entity, entityId]`, `[actorId]`, `[createdAt]`
  - `backend/src/audit/` — `AuditService.log()` (try/catch, never throws), `audit-actions.constants.ts`, `@Global()` `AuditModule`
  - `ListingsService.update()` logs `LISTING_STATUS_CHANGED` or `LISTING_REJECTED` with before/after status payloads
  - Tests: `audit.service.spec.ts`, `listings.service.spec.ts` (status transition audit)
  - Validated: local `PATCH /api/v1/listings/:id` (staff) → `audit_logs` row with correct JSON; Gate A + `npm run smoke:api`

- [x] **Platform configuration**
  - Add `PlatformConfig` singleton model to Prisma schema: `id String @id @default("singleton")`, `vatRate Decimal @default(0.075) @db.Decimal(5,4)`, `maxUploadMb Int @default(15)`, `paystackEnabled Boolean @default(true)`, `flutterwaveEnabled Boolean @default(false)`, `maintenanceMode Boolean @default(false)`, `updatedAt DateTime @updatedAt`
  - Run migration
  - Create `backend/src/platform-config/` module with service and controller
  - Service: `get()` upserts singleton on first call then caches for 60s; `update(dto, actorId)` invalidates cache; `getVatRate(): number`; `getMaxUploadBytes(): number`
  - Controller: `GET /platform-config` (any authenticated user), `PATCH /platform-config` (ADMIN only)
  - Validation: `curl -X GET $SBR_API_BASE/platform-config -H "Cookie: <auth-cookie>"` returns `{ vatRate: "0.075", maxUploadMb: 15, ... }`; local smoke passed on `http://localhost:3001/api/v1`; branch preview deployed but direct curl needs Vercel Deployment Protection bypass/auth

- [x] **Property spec fields — frontend** (PR `cursor/step2-spec-fields-fe-e4ea`)
  - `ListingDto` optional spec fields in `src/hooks/use-listings.ts`; `src/lib/listing-spec.ts` for create payload + detail summary (`4 beds · 3 baths`)
  - Seller create form (`dashboard.seller.listings.tsx`) POSTs specs when present; detail page (`listings.$listingId.tsx`) shows formatted spec row
  - BE: create/update persist spec fields; optional JWT guard cookie fix for seller draft detail
  - Tests: `src/lib/listing-spec.test.ts`; `listings.service.spec.ts` create-with-specs
  - Validated: Gate A + local L5 E2E (seller create + detail spec row); Vercel preview after merge

---

## Step 3 — Verification Pipeline Completion

- [x] **Listing status vocabulary — database** (PR #38)
  - Add `UNDER_OFFER` and `SOLD` to the `ListingStatus` enum in `backend/prisma/schema.prisma`
  - Run migration
  - Validation: migration on main; `ListingStatus` includes `UNDER_OFFER` / `SOLD` in schema (PR #38)

- [x] **Listing status vocabulary — frontend label mapping** (PR #39)
  - Create `src/lib/listing-status.ts` with three exported functions:
    - `statusLabel(status: string): string` — maps backend values to user-facing labels: `PENDING_REVIEW → "Pending Review"`, `ASSIGNED → "In Verification"`, `IN_VERIFICATION → "In Verification"`, `VERIFIED → "Verified"`, `LIVE → "Live"`, `UNDER_OFFER → "Under Offer"`, `SOLD → "Sold"`, `REJECTED → "Rejected"`, `DRAFT → "Draft"`, `ARCHIVED → "Archived"`
    - `statusBadgeClass(status: string): string` — returns Tailwind classes: green for LIVE/VERIFIED, amber for IN_VERIFICATION/ASSIGNED, red for REJECTED, blue for UNDER_OFFER, gray for DRAFT/ARCHIVED
    - `statusIsPublic(status: string): boolean` — true only for LIVE
  - Replace all inline status label/class logic in: `src/components/ListingCard.tsx`, `src/routes/dashboard.seller.tsx`, `src/routes/dashboard.admin.listings.tsx`, `src/routes/dashboard.buyer.listings.tsx`
  - Validation: `src/lib/listing-status.ts` maps all statuses; `ListingCard` + seller/admin/buyer dashboards use shared helpers (PR #39)

- [x] **Professional credential profile** (PR #42)
  - Add `ProfessionalProfile` model to Prisma schema: `id`, `userId String @unique`, `user User @relation(...)`, `regulatoryBody String` (NBA, SURCON, NIESV, NIQS, etc.), `licenseNumber String`, `licenseExpiry DateTime?`, `verifiedStatus String @default("PENDING")` (PENDING, VERIFIED, REJECTED), `verifiedById String?`, `verifiedAt DateTime?`, `rejectionNote String?`
  - Run migration
  - Backend: `GET /professionals/me/profile`, `PUT /professionals/me/profile`, `PATCH /professionals/:id/verify` (STAFF/ADMIN only)
  - Frontend: add a "My Credentials" section to the professional dashboard where they can view and update their profile and see their verification status
  - Frontend: add a credential review section to the staff dashboard listing professionals pending verification with approve/reject actions
  - Validation: `ProfessionalProfile` model + migration; `/professionals/me/profile` + staff verify; pro/staff credential routes on main (PR #42)

- [x] **Risk flag taxonomy and picker UI** (PR #39)
  - Create `src/lib/risk-flags.ts` exporting `RISK_FLAGS` array with objects `{ code: string, label: string, description: string }` for: `BOUNDARY_DISPUTE`, `GOVT_ACQUISITION`, `FLOOD_ZONE`, `OMO_ONILE_ACTIVITY`, `TITLE_ENCUMBRANCE`, `LITIGATION_PENDING`, `SURVEY_DISCREPANCY`, `INCOMPLETE_DOCUMENTS`
  - In professional task detail page: replace any hardcoded risk flag input with a multi-select checkbox picker using these constants
  - In staff workflow page: show flagged risks as labelled badges (not raw strings) when viewing a submitted step
  - Validation: `src/lib/risk-flags.ts` + pro task multi-select + staff workflow labelled badges (merged with PR #39)

- [x] **Report acceptance and revision loop** (PR #41)
  - Backend: add `ACCEPTED` and `REVISION_REQUESTED` to verification step status enum (alongside existing statuses)
  - Add `revisionNote String?` field to `VerificationStep` model; run migration
  - Add endpoints: `PATCH /verification/steps/:stepId/accept` (STAFF only), `PATCH /verification/steps/:stepId/request-revision` (STAFF only, body: `{ note: string }`)
  - Frontend: in staff workflow, when viewing a SUBMITTED step, show "Accept" and "Request Revision" buttons. Revision button opens a textarea for the note.
  - Frontend: in professional task detail, when status is REVISION_REQUESTED, show the revision note prominently and allow resubmission
  - Validation: `ACCEPTED` / `REVISION_REQUESTED` enum + `revisionNote`; accept/request-revision endpoints; staff + pro UI wired (PR #41)

---

## Step 4 — Service Catalog

- [x] **Service catalog — database and seed** (main `2a6c515`)
  - Add models to Prisma schema: `ServiceCatalogItem` (`id`, `code String @unique`, `name`, `description`, `basePrice Decimal @db.Decimal(18,2)`, `active Boolean @default(true)`, `sortOrder Int @default(0)`), `ServiceBundle` (`id`, `code String @unique`, `name`, `description`, `basePrice Decimal @db.Decimal(18,2)`, `active Boolean @default(true)`), `BundleItem` (`bundleId`, `itemId`, `@@id([bundleId, itemId])`)
  - Run migration
  - Create `backend/src/service-catalog/service-catalog.service.ts` with `onModuleInit()` that seeds default data if catalog is empty. Seed all 15 services (codes listed in the Master Plan) with base price 150000. Seed 3 bundles: STANDARD (2950000, services 1-5), PREMIUM (4200000, services 1-10), ELITE (5850000, all 15).
  - Validation: `ServiceCatalogItem` / `ServiceBundle` / `BundleItem` models; `onModuleInit` seeds 15 items + STANDARD/PREMIUM/ELITE bundles (main `2a6c515`)

- [x] **Service catalog — API endpoints** (main `2a6c515`)
  - `GET /service-catalog/items` — public, returns all active items sorted by sortOrder
  - `GET /service-catalog/bundles` — public, returns bundles with their included items
  - `POST /service-catalog/calculate` — authenticated, body: `{ itemIds?: string[], bundleId?: string }`, returns `{ subtotal: number, vat: number, total: number }` using the platform VAT rate from PlatformConfigService
  - `PATCH /service-catalog/items/:id` — ADMIN only, update name/description/price/active
  - Validation: `GET /service-catalog/items|bundles`, `POST /service-catalog/calculate` (VAT via PlatformConfig), admin PATCH on main (`2a6c515`)

- [x] **Service catalog — frontend selection UI** (main `568e841`)
  - Create `src/components/ServiceSelector.tsx` — a component that fetches bundles and items, presents three bundle cards (with names, included services listed, and price), and an "à-la-carte" section below where individual services can be checked/unchecked
  - Shows a live running total at the bottom: Services subtotal, VAT (7.5%), Total — all in ₦ formatted with commas
  - When a bundle is selected, the individual services within it are pre-checked (but still visible)
  - Exposes `onSelectionChange({ itemIds: string[], bundleId?: string, total: number })` callback prop
  - This component will be embedded in the DD Purchase Wizard in Step 10 — build it as a standalone reusable component for now
  - Validation: `src/components/ServiceSelector.tsx` + `use-service-catalog.ts` — bundle cards, à-la-carte, live VAT total (main `568e841`)

---

## Step 5 — Payment Architecture

- [x] **Two payment intent types — database** (PR #46)
  - Add `PaymentIntent` enum to Prisma schema: `DD_SERVICE`, `PROPERTY_PURCHASE`
  - Add `intent PaymentIntent @default(DD_SERVICE)` to `Payment` model
  - Add `DueDiligenceOrder` model: `id`, `transactionId String @unique`, `buyerId String`, `bundleId String?`, `itemIds Json @default("[]")`, `subtotal Decimal @db.Decimal(18,2)`, `vatAmount Decimal @db.Decimal(18,2)`, `total Decimal @db.Decimal(18,2)`, `status String @default("PENDING")` (PENDING, PAID, IN_PROGRESS, COMPLETE), `createdAt`, `updatedAt`
  - Update `Transaction` model status values: add `DD_PURCHASED`, `DD_IN_PROGRESS`, `DD_COMPLETE`, `PURCHASE_PENDING`, `PURCHASE_IN_ESCROW` to the enum (keep existing values)
  - Run migration — default all existing Payment records to `DD_SERVICE` intent (safe: all current payments are DD-style)
  - Validation: migration `20260526174322`; `PaymentIntent`, `DueDiligenceOrder`, extended `TransactionStatus` on main (PR #46)

- [x] **Two payment intent types — backend service** (PR #46)
  - Update `PaymentsService.initiate()` to accept `intent: PaymentIntent` and optional `ddOrderId: string`
  - When `intent = DD_SERVICE` and a `DueDiligenceOrder` exists for the transaction, link the payment to it
  - Update the Paystack webhook handler: when a `DD_SERVICE` payment succeeds, transition `transaction.status → DD_PURCHASED` and `listing.status → UNDER_OFFER`; trigger notifications for buyer (DD started), seller (property reserved), and staff (begin verification work)
  - When `intent = PROPERTY_PURCHASE` payment succeeds: transition `transaction.status → PURCHASE_IN_ESCROW` (escrow model comes in Step 7 — for now, just record the status transition)
  - Add endpoint: `POST /due-diligence-orders` — authenticated buyer, body: `{ transactionId, itemIds?, bundleId? }`, creates a `DueDiligenceOrder` and returns it with calculated totals
  - Validation: `PaymentsService.initiate` + webhook DD/PROPERTY paths; `POST /due-diligence-orders` + `DueDiligenceService.create` on main (PR #46)

- [x] **Two payment intent types — frontend** (PR #46)
  - Update `src/hooks/use-payments.ts` to include `intent` field in the initiate payment mutation payload
  - Update `src/hooks/use-transactions.ts` to include the new status values in any type definitions
  - On the buyer transaction detail page: display the payment intent label clearly — "Due Diligence Payment" or "Property Purchase Payment" — instead of a generic "Payment" label
  - Show the extended transaction status with a human-readable label matching the vocabulary in the Master Plan
  - Validation: `use-payments.ts` intent field; `dashboard.buyer.transactions.tsx` payment intent + DD status labels (PR #46)

---

## Step 6 — Power of Attorney

- [x] **PoA — database model** (PR #54)
  - Add `PowerOfAttorney` model: `id`, `transactionId String @unique`, `buyerId String`, `listingId String`, `pdfStorageKey String`, `documentHash String` (SHA-256 hex), `qrCodeStorageKey String`, `signatureMethod String` (DRAWN or TYPED), `signatureName String`, `consentFlags Json` (object with 4 boolean keys), `ipAddress String?`, `userAgent String?`, `executedAt DateTime @default(now())`
  - This model has no `updatedAt` — it is append-only and immutable
  - Run migration
  - Validation: `PowerOfAttorney` model + migration on main (PR #54)

- [x] **PoA — PDF generation backend** (PR #54)
  - Install `pdfkit` in the backend (`npm install pdfkit @types/pdfkit`)
  - Create `backend/src/poa/poa.service.ts` with method `generate(buyerName, listingTitle, listingAddress, executedAt): Buffer` that produces a PDF containing the full PoA instrument text (see Master Plan for the required clauses: scope of authority, revocation, indemnity, legal framework references)
  - The PDF should include: platform name and logo text at top, buyer's full name, property address, date of execution, and the four consent items confirmed
  - After generating the PDF buffer: compute SHA-256 hash using Node's built-in `crypto`, generate a QR code (install `qrcode` package) encoding `https://safebuyrealties.com/verify?hash={hash}`, upload all three (PDF, QR PNG) via StorageService
  - Create `POST /poa/execute` endpoint: authenticated buyer, body: `{ transactionId, signatureMethod, signatureName, consentFlags }` — generates PDF, hashes it, stores it, creates the `PowerOfAttorney` record, returns the record
  - Create `GET /poa/verify?hash={hash}` — public endpoint that looks up by hash and returns confirmation or "not found"
  - Validation: `POST /poa/execute`, `GET /poa/verify?hash=…`; PDF + QR via StorageService; SHA-256 hash (PR #54)

- [x] **PoA — frontend execution screen** (PR #54)
  - Create `src/components/PoAExecutionScreen.tsx` — a full-screen step component that:
    - Shows the platform name and scope statement at the top
    - Displays the PoA instrument text in a scrollable panel (firm name, scope of authority, revocation clause, indemnity clause, Nigerian legal references)
    - Shows 4 mandatory consent checkboxes (all must be checked to proceed): "I confirm I am of full legal capacity to execute this document", "I acknowledge this PoA will require independent witnessing to be legally binding", "I agree to register this document at the relevant Land Registry within 60 days", "I acknowledge this Power of Attorney is irrevocable once executed"
    - Shows a signature panel with two tabs: "Draw" (canvas where user draws signature) and "Type" (user types full legal name in a styled input)
    - The Execute button is disabled until all 4 checkboxes are checked and a signature is provided
    - On click: calls `POST /poa/execute`, shows a loading state, then a success confirmation with the document hash
  - Validation: `PoAExecutionScreen.tsx` — consent checkboxes, draw/type signature, execute + success hash (PR #54)

---

## Step 7 — Escrow and Payouts

- [x] **Escrow — database model** (PR #58)
  - Add `Escrow` model: `id`, `transactionId String @unique`, `status String @default("AWAITING_FUNDS")` (AWAITING_FUNDS, HELD, RELEASED, REFUNDED), `heldAmount Decimal @db.Decimal(18,2)`, `releaseConditions Json @default("[]")`, `conditionsMet Json @default("[]")`, `heldAt DateTime?`, `releasedAt DateTime?`, `refundedAt DateTime?`, `releasedById String?`, `releaseNote String?`
  - Add `Payout` model: `id`, `transactionId String`, `sellerId String`, `grossAmount Decimal @db.Decimal(18,2)`, `platformFee Decimal @db.Decimal(18,2)`, `netAmount Decimal @db.Decimal(18,2)`, `status String @default("PENDING")` (PENDING, INITIATED, COMPLETED, FAILED), `gatewayReference String?`, `initiatedAt DateTime?`, `completedAt DateTime?`
  - Run migration
  - Validation: `Escrow` + `Payout` models + migration on main (PR #58)

- [x] **Escrow — hold and release logic** (PR #58)
  - Create `backend/src/escrow/escrow.service.ts`
  - `hold(transactionId, amount)`: creates or updates Escrow record to HELD, records heldAt — called when a property purchase payment succeeds
  - `checkConditions(transactionId)`: returns array of unmet conditions based on the transaction state
  - `release(transactionId, staffId, note)`: ADMIN/STAFF only — verifies conditions are met, transitions to RELEASED, triggers `initiatePayout()`
  - `refund(transactionId, staffId, note)`: transitions to REFUNDED, transitions listing back to VERIFIED status, notifies buyer
  - `initiatePayout(transactionId)`: calculates seller's net amount (gross minus 5% platform fee), calls Paystack Transfer API, creates Payout record
  - Add endpoints: `GET /escrow/:transactionId` (buyer and seller see their own), `POST /escrow/:transactionId/release` (ADMIN/STAFF), `POST /escrow/:transactionId/refund` (ADMIN/STAFF)
  - Validation: `EscrowService` hold/release/refund/payout; `GET/POST /escrow/:transactionId/*` endpoints (PR #58)

- [x] **Property reservation — anti-double-sell** (PR #56)
  - When `listing.status → UNDER_OFFER`: add a check in `transactions.service.ts` `create()` that rejects new transactions for the same listing if it is already in UNDER_OFFER status
  - The rejection should return HTTP 409 with message: "This property is currently under offer and cannot be reserved by another buyer"
  - Frontend: handle this 409 on the buyer listing detail page — show a clear "Under Offer" state with disabled purchase button and appropriate messaging
  - Validation: `transactions.service.ts` 409 when listing `UNDER_OFFER`; buyer listing detail shows disabled purchase state (PR #56)

- [x] **Escrow — frontend status display** (PR #58)
  - On the buyer transaction detail page: add an escrow status section showing current escrow state (Awaiting Funds, Held, Released, Refunded), held amount, and if released — the release date
  - On the admin dashboard: add an escrow management section listing all HELD escrows with release/refund action buttons
  - Validation: buyer transaction detail escrow section; admin escrow management with release/refund actions (PR #58)

---

## Step 8 — Notifications

- [x] **Notifications — database and backend service** (PR #55)
  - Add `Notification` model: `id`, `userId String`, `user User @relation(...)`, `type String`, `title String`, `body String`, `entityId String?`, `entityType String?` (Listing, Transaction, Task, VerificationStep), `readAt DateTime?`, `createdAt DateTime @default(now())`; index on `[userId, readAt]`
  - Add `notifications Notification[]` to `User` model
  - Run migration
  - Create `backend/src/notifications/notifications.service.ts` with: `create()` (never throws), `listForUser(userId, page, pageSize)` returning `{ notifications, unreadCount }`, `markRead(userId, notificationId)`, `markAllRead(userId)`
  - Create `backend/src/notifications/notification-types.constants.ts` (see Master Plan for the full list of type constants)
  - Create notification endpoints: `GET /notifications/me` (paginated), `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`
  - Make the notifications module `@Global()` so other services can inject it
  - Validation: `curl GET /notifications/me` with auth returns `{ data: [], meta: { unreadCount: 0, ... } }`

- [x] **Notifications — trigger from events** (PR #55)
  - Inject `NotificationsService` into: `listings.service.ts`, `verification.service.ts`, `tasks.service.ts`, `payments.service.ts`
  - Add `create()` calls at each key event: listing submitted (→ notify all staff), listing verified (→ notify seller), listing rejected (→ notify seller with reason), task assigned (→ notify professional), report submitted (→ notify staff), revision requested (→ notify professional), DD payment succeeded (→ notify buyer, seller, staff), escrow released (→ notify buyer, seller)
  - Validation: submit a listing as a seller, confirm a notification row exists in the database for staff users; verify the listing as staff, confirm the seller gets a notification

- [x] **Notifications — frontend bell** (PR #55)
  - Add a notification bell icon to `src/components/dashboard/DashboardLayout.tsx` in the top bar
  - Bell shows an unread count badge when there are unread notifications
  - Clicking the bell opens a dropdown panel showing the 10 most recent notifications, each with title, body, time ago, and a subtle unread indicator
  - Clicking a notification marks it as read and navigates to the relevant entity if `entityId` is present
  - "Mark all read" button at the top of the panel
  - Polling or refetch on window focus using TanStack Query's `refetchOnWindowFocus`
  - Validation: trigger a notification (e.g., submit a listing as seller), switch to staff account — the bell shows unread count 1. Click it — the notification appears. Click it again — it is marked read and count resets.

---

## Step 9 — KYC

- [x] **KYC — database model and backend** (PR #60)
  - Add `KycRecord` model: `id`, `userId String @unique`, `user User @relation(...)`, `status String @default("NOT_SUBMITTED")` (NOT_SUBMITTED, SUBMITTED, VERIFIED, REJECTED), `documentKeys Json @default("[]")` (array of storage keys), `reviewerId String?`, `reviewNote String?`, `submittedAt DateTime?`, `reviewedAt DateTime?`
  - Run migration
  - Endpoints: `GET /kyc/me` (user's own KYC status), `POST /kyc/submit` (buyer submits documents — uploads via existing document endpoint then calls this to mark as submitted), `GET /kyc/queue` (STAFF only — all SUBMITTED records), `PATCH /kyc/:userId/verify` (STAFF only), `PATCH /kyc/:userId/reject` (STAFF only, body: `{ note: string }`)
  - Validation: submit KYC as a buyer (with a test document), check the staff queue — record appears. Staff verifies — user's KYC status updates to VERIFIED.

- [x] **KYC — frontend user profile** (PR #60)
  - Add a "Verify Your Identity" section to the buyer profile or dashboard
  - Shows current KYC status with appropriate copy: NOT_SUBMITTED ("Please verify your identity to complete property purchases"), SUBMITTED ("Your documents are under review — we'll notify you when complete"), VERIFIED ("Identity Verified ✓"), REJECTED (shows rejection note and option to resubmit)
  - If NOT_SUBMITTED or REJECTED: show a document upload section for government ID and a selfie/utility bill
  - Validation: as a buyer, upload KYC documents — status changes to SUBMITTED and the prompt changes to the review-in-progress message

- [x] **KYC — staff review queue frontend** (PR #60)
  - Add a "KYC Reviews" tab to the staff dashboard
  - Shows a table of users with SUBMITTED KYC records: name, email, submission date, documents link
  - Verify and Reject buttons with the reject action requiring a typed reason
  - Validation: staff can approve/reject KYC from the UI, buyer sees status update

---

## Step 10 — The DD Purchase Wizard

This is the main buyer journey. It is the most important screen in the product.

- [x] **Wizard — route and state structure** (PR #51)
  - Create route `/purchase/:listingId` accessible only to authenticated buyers for listings with status LIVE
  - Create a wizard state machine with 7 steps: `PROPERTY_CONFIRMATION`, `BUYER_INFO`, `POA_EXECUTION`, `SERVICE_SELECTION`, `ORDER_SUMMARY`, `PAYMENT`, `SUCCESS`
  - Persist current step and collected data to `sessionStorage` (keyed by listingId) so the buyer can leave and return
  - On mount, read session storage and restore to the last step
  - A progress bar or step indicator shows which step the buyer is on
  - Validation: `/purchase/:listingId` route; 7-step state machine; `sessionStorage` restore (PR #51)

- [x] **Wizard — Step 1: Property confirmation** (PR #51)
  - Shows: hero image, title, location, price, verification badge with date, brief description, key specs (beds/baths/area)
  - A "Proceed to verify identity and start due diligence" primary button
  - Validation: hero, specs, verification badge, proceed CTA for LIVE listings (PR #51)

- [x] **Wizard — Step 2: Buyer information** (PR #51)
  - Form: Full Legal Name, Email Address, Phone Number, Country, State
  - Pre-fill from the logged-in user's profile where available
  - Validation: buyer info form with profile pre-fill; required fields + wizard state (PR #51)

- [x] **Wizard — Step 3: Power of Attorney** (PR #57, #54)
  - Embed the `PoAExecutionScreen` component built in Step 6
  - On successful execution, store the returned PoA ID in wizard state and advance to Step 4
  - If the user already has an executed PoA for this transaction (returning user), show a confirmation of the existing execution and allow them to proceed
  - Validation: `PoAExecutionScreen` embedded; existing PoA skip path; advances on execute (PR #57, #54)

- [x] **Wizard — Step 4: Service selection** (PR #51)
  - Embed the `ServiceSelector` component built in Step 4
  - User's selection is saved to wizard state
  - Validation: `ServiceSelector` embedded; bundle/à-la-carte + VAT total in wizard state (PR #51)

- [x] **Wizard — Step 5: Order summary** (PR #51)
  - Shows: selected services or bundle name, each service with price, subtotal, VAT amount (7.5%), total in ₦
  - A "Confirm and Pay ₦X,XXX,XXX" primary button
  - On click: create the `DueDiligenceOrder` via `POST /due-diligence-orders`, then initiate the Paystack payment
  - Validation: order summary + `POST /due-diligence-orders` before payment (PR #51)

- [x] **Wizard — Step 6: Payment** (PR #51)
  - Initiates Paystack/Flutterwave checkout for the DD service total
  - In development: use mock mode — a "Simulate Payment Success" button that calls the webhook handler manually
  - On payment success: advance to Step 7
  - On payment failure: show an error with a "Try Again" option that returns to Step 5
  - Validation: Paystack checkout + dev simulate success; `DD_PURCHASED` / `UNDER_OFFER` transitions (PR #51)

- [x] **Wizard — Step 7: Success** (PR #51)
  - Shows: confirmation message, transaction reference number, brief explanation of next steps (team will begin verification, estimated timeline), link to transaction dashboard
  - Clears the session storage for this listing
  - Validation: confirmation + transaction ref + next steps; clears `sessionStorage` (PR #51)

---

## Step 11 — Remaining Screens

- [x] **Advanced search with server-side filters** (PR #62)
  - Backend: update `GET /listings` to accept query params: `location`, `minPrice`, `maxPrice`, `buildType`, `minBeds`, `status` — apply as Prisma `where` conditions
  - Frontend: add a filter bar above the listings grid on the buyer listings page with inputs for each filter
  - Filters apply on change with debouncing (300ms)
  - Active filters shown as removable chips
  - Validation: filter by minBeds=3, confirm only listings with beds >= 3 are returned

- [x] **Saved / liked properties**
  - Add `SavedProperty` model: `id`, `buyerId String`, `listingId String`, `createdAt`, `@@unique([buyerId, listingId])`; run migration
  - Backend: `POST /listings/:id/save`, `DELETE /listings/:id/save`, `GET /listings/saved` (buyer's saved list)
  - Frontend: heart icon on every listing card, filled when saved. Toggle saves/unsaves. Buyer dashboard has a "Saved Properties" tab.
  - Notify buyer when a saved property's status changes (e.g., goes LIVE, goes UNDER_OFFER)
  - Validation: save a listing, it appears in "Saved Properties" tab. Change listing to UNDER_OFFER as admin — buyer receives notification.

- [x] **Inspection scheduling**
  - Add `InspectionSlot` model: `id`, `listingId`, `professionalId`, `requestedById`, `scheduledAt DateTime`, `status String @default("REQUESTED")` (REQUESTED, CONFIRMED, COMPLETED, CANCELLED), `outcome String?`, `notes String?`; run migration
  - Backend: `POST /listings/:id/inspection-requests`, `GET /listings/:id/inspection-requests`, `PATCH /inspection-slots/:id` (status update, outcome logging)
  - Frontend: "Schedule Inspection" button on the listing detail page (currently a disabled stub) — opens a date/time picker, submits request. Shows scheduled inspections and their status on the buyer's transaction page.
  - Validation: request an inspection as a buyer, confirm as staff, log an outcome — all status transitions visible in the UI

- [x] **Analytics — seller performance**
  - Backend: `GET /listings/:id/analytics` returning `{ views: number, saves: number, transactionCount: number, ddPurchases: number }` — these can be approximate counts from existing data, no real view tracking needed yet
  - Frontend: add a performance summary section to each seller listing in their dashboard — views, saves, enquiries
  - Validation: listing shows analytics numbers (even if all zero — the section renders without crashing)

- [x] **Analytics — admin overview**
  - Backend: `GET /admin/analytics` returning `{ totalListings, liveListings, totalTransactions, totalDdRevenue, pendingKyc, pendingVerifications }`
  - Frontend: update admin dashboard home page to show these numbers as stat cards (layout already exists via DashboardLayout StatCard component)
  - Validation: admin dashboard shows stat cards with real numbers from the database

---

## Completion

When all items above are checked, the platform is feature-complete for the initial scope. At that point:
- Run a full end-to-end test of the primary buyer journey (register → browse → purchase DD → complete wizard → track transaction)
- Run a full end-to-end test of the seller journey (register → list property → upload docs → submit → track verification)
- Run a full end-to-end test of the staff workflow (receive submission → assign professionals → review reports → approve listing)
- Document any remaining issues in a `docs/POST_BUILD_ISSUES.md` file
