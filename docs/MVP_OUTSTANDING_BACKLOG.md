# SafeBuyRealties, outstanding MVP backlog

**Prepared:** 2026-07-29 · **Codebase reviewed:** `main` @ `fc05e1e` (2026-07-24) · **Paradigm applied:** derived from `/Users/saito/projects/voxdiary`

Two audiences, one document. Section 1 to 3 are for stakeholders (what is done, what is left, what it costs, what the risk is). Section 4 onward is the developer backlog: one story, one PR, testable acceptance criteria, cited evidence for every claimed gap.

Every "not built" claim below was verified by reading the code, not by reading `docs/BUILD_CHECKLIST.md`. File and line references are given so any claim can be checked in under a minute.

---

## 0. The paradigm, derived from voxdiary

The user asked for the software paradigm used in `/Users/saito/projects/voxdiary`. It is not one thing, it is a stack of four layers. Each layer is summarised here and then applied to this backlog.

### 0.1 Architectural paradigm

| Dimension | voxdiary | SafeBuyRealties today |
| --- | --- | --- |
| Repo shape | pnpm + Turborepo monorepo: `apps/{api,web,mobile,docs-site}`, `services/voice-ai`, `packages/{shared,api-client,ui-tokens,config}` | Two-package repo: frontend at root, `backend/` beside it, no shared contract package |
| Style | Modular monolith, domain modules, ports and adapters, SOLID enforced by review | Modular monolith, NestJS domain modules, same instinct, less formality |
| Polyglot | TypeScript NestJS + Python FastAPI, Rust adoption behind explicit triggers (ADR-0006) | TypeScript only |
| Eventing | Transactional outbox to BullMQ, Redpanda later (ADR-0002) | Direct in-process calls, some fire-and-forget `void` promises |
| Contracts | One Zod schema shared client and server, JSON Schema exported for the Python service | DTOs on the server, hand-written mirror types in `src/hooks/*`, drift is possible |
| Tenancy | `firmId` on every table, fail-closed Prisma extension, tenant isolation is unflagged because an invariant has no off switch | Ownership checks written per service, no central enforcement layer |
| Delivery | Every user-facing change behind a named feature flag with a kill switch (ADR/rules §13) | No feature-flag system |

The relevant transfer is not "become a monorepo". It is the three habits that make voxdiary's delivery predictable: a shared contract, a fail-closed authorization layer rather than per-service checks, and a flag on every risky change.

### 0.2 Delivery paradigm

- One story equals one small PR, target under about 400 changed lines, behind a feature flag, squash merged with a conventional-commit title.
- Agent loop: product owner writes story plus acceptance criteria, architect designs and writes an ADR when there is a real decision, developer implements a thin vertical slice with tests, reviewer and security architect review against `rules.md`, writer updates docs.
- Every story is logged on a PR tracker board with a status emoji: 📋 planned, 🔨 in progress, 👀 in review, ✅ merged, ⛔ blocked, 🚫 superseded.
- Sizes: S is about a day, M is two to four days, L is about a week.
- The critical path is marked explicitly, and no story off it may move the launch date.
- Work that is not code (legal sign-off, vendor accounts, secrets, content) is tracked separately as external inputs with owners and due dates, and go-live gates are numbered.

### 0.3 Quality paradigm (the definition of done)

voxdiary's `rules.md` §1 gate, in short: no unhandled 5xx and correct 4xx mapping, metrics plus traces plus structured logs on every endpoint with a correlation id and never PII in logs, 100 percent line and branch coverage on new code plus mutation testing, zero Sonar issues and zero duplicated lines on new code, zero warnings from every tool, root-cause fixes with a regression test rather than suppressions, and docs updated in the same PR that changed the behaviour.

SafeBuyRealties currently gates on TypeScript compile, ESLint with zero warnings, and unit tests. There is no coverage threshold (`backend/jest.config.js` sets `collectCoverageFrom` but no `coverageThreshold`), no mutation testing, no static analysis gate, and the end-to-end scripts in `scripts/` are not run by CI (`.github/workflows/ci.yml`).

Adopting the full voxdiary bar mid-project would stall delivery. The proposal in this backlog is a **ratchet**: apply the strict bar to new and touched code only, and raise the floor over time. That mirrors voxdiary's own ADR-0013, which replaced an absolute gate with a delta gate plus a tracked baseline carrying a remediation SLA.

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

**Three. Private documents are publicly readable.** Uploaded files are served by an unauthenticated static route. Anyone who learns or guesses a storage key can fetch a title deed, a government ID, or a KYC selfie without logging in. On the current Vercel deployment those files also land in ephemeral serverless storage, so in production uploads disappear between requests. For a platform whose entire proposition is document trust, sold to clients who were previously defrauded, this is the finding that most needs to close before any real user is invited.

### 1.3 What it takes

| Milestone | Outcome | Stories | Estimate |
| --- | --- | --- | --- |
| **M1 Close the loop** | A buyer can complete a purchase on-platform, end to end | E1 (4) | 11 to 14 days |
| **M2 Money integrity** | Real sellers get paid, real refunds are repaid, no double processing | E2 (5) | 12 to 15 days |
| **M3 Document trust** | Private documents stay private and survive deployment | E3 (4) | 7 to 10 days |
| **M4 Access correctness** | Privileges are enforced by the API, not only by the menu | E4 (3) | 6 to 9 days |
| **M5 Account security** | Rate limits, real sessions, password reset, verified email | E5 (5) | 11 to 15 days |
| **M6 Communications** | Email actually leaves the building | E6 (3) | 5 to 7 days |
| **M7 Operability** | Failures are visible, regressions are caught before merge | E7 (6) | 10 to 14 days |
| **M8 Go-live compliance** | NDPR, legal review, security review, public web surface | E8 (4) | 8 to 12 days plus external lead time |

Total: 34 milestone stories plus two chores (DOCS-1 and CH-1, about 4 days), 36 in all, roughly 72 to 100 developer-days. One developer lands that in about 15 to 20 calendar weeks. Two developers working the split in section 6 land it in about 8 to 10 weeks, because M1 and M3 parallelise cleanly and M2 depends on M1 only at the final story.

**Demo-safe subset.** If the near-term need is a credible client demo rather than a public launch, M1 plus M3 plus E2-S2 and E2-S4 is enough, roughly 22 to 28 days. That produces a complete buyer journey with private documents and no way to accidentally show a fake payout as real. It is not enough to invite real users onto real naira.

### 1.4 Decisions needed before the work starts

These are product and commercial decisions. Engineering can proceed on M3 without them, and cannot finish M1 or M2 without them.

| # | Decision | Why it blocks | Recommendation |
| --- | --- | --- | --- |
| D1 | Is the on-platform property purchase in the MVP, or is standalone due diligence the MVP? | Two due diligence paths exist and only one is complete. Answering "standalone only" removes most of E1 and E2 and cuts about 20 days | Confirm on-platform is in scope, since escrow and PoA only pay off there. If it is not, retire the wizard rather than leaving it half-wired |
| D2 | Escrow money model and the settlement account | Whether SafeBuyRealties holds client funds changes the CBN and AML posture, and changes E2-S1 from a bank-details form into a regulated flow | Legal and compliance review before E2-S1 starts |
| D3 | KYC: manual review or a provider such as Smile ID or VerifyMe | Manual is built. A provider changes E4-S2 and adds vendor lead time | Ship manual for MVP, keep the provider seam |
| D4 | Object storage provider and region | Blocks E3-S2, which is on the critical path | S3-compatible, decide region for NDPR data residency |
| D5 | Adopt the voxdiary quality bar as a ratchet on new code | Sets the definition of done for every story below | Yes, ratchet only, per section 0.3 |

---

## 2. Verified current state

### 2.1 What the audit covered

Prisma schema (719 lines, 30 models, 10 enums), 30 NestJS modules and every controller route, 61 frontend routes, 29 data hooks, 24 backend spec files, 7 frontend test files, the CI workflow, the environment templates, and the six status documents in `docs/`.

### 2.2 Endpoint inventory, by module

Auth, users, listings, documents, verification, tasks, transactions, payments and webhooks, platform config, professionals, service catalog, due diligence orders, PoA, escrow, KYC, notifications, inspections, guest checkout, standalone DD, admin analytics, admin roles, permissions, DD checklist CMS, health. 104 route handlers across 26 controller classes.

### 2.3 Where the documentation disagrees with the code

| Document | Status | Note |
| --- | --- | --- |
| `docs/BUILD_CHECKLIST.md` | Optimistic | Every item is `[x]`, including "API, staff/client DD case lifecycle". That is true for standalone DD and false for listing-based DD |
| `docs/analysis/03_CURRENT_STATE_AUDIT.md` | Stale, 2026-05-23 | Its three crashing screens were fixed in Step 1, its missing trust layer now exists |
| `docs/TECH_AUDIT.md` | Stale, 2026-05-02 | Predates cookie auth, transactions, escrow, and object storage |
| `docs/VALIDATION_REPORT.md` | Stale, 2026-05-25 | Snapshot of a production deploy two months old |
| `docs/QA_FINDINGS.md` | Mostly closed | QA-015 (seeded documents have no files on disk) and QA-016 (Paystack not validated end to end locally) remain open |
| `docs/analysis/05_STRATEGIC_RECOMMENDATIONS.md` | Still the right frame | Its Core MVP and Launch-Ready buckets map onto E1 to E4 and E5 to E8 below |

**First housekeeping action, before any story:** reconcile `BUILD_CHECKLIST.md` against this document, and mark the stale analysis files with a header that points here. In the voxdiary paradigm this is a `DOCS-1` chore, size S, and it is worth doing because the checklist is what every AI agent on this repo reads first.

---

## 3. Board

Status: `📋 planned` · `🔨 in progress` · `👀 in review` · `✅ merged` · `⛔ blocked`
Size: S is about a day · M is two to four days · L is about a week
🔴 CP marks the critical path to a launchable product.

| ID | Epic | Story | Flag | Size | Status | Deps |
| --- | --- | --- | --- | --- | --- | --- |
| DOCS-1 | Chore | Reconcile the checklist and mark stale analysis docs | — | S | 📋 | none |
| CH-1 | Chore | Feature-flag service with kill switch, server and client | — | M | 📋 | none |
| E1-S1 🔴 | Loop | Listing DD case lifecycle: queue, assign, report, complete | `dd_case_lifecycle` | L | 📋 | D1 |
| E1-S2 🔴 | Loop | Transaction state machine, DD_PURCHASED to DD_COMPLETE | `dd_case_lifecycle` | M | 📋 | E1-S1 |
| E1-S3 🔴 | Loop | Buyer DD report delivery, access controlled | `dd_case_lifecycle` | M | 📋 | E1-S1, E3-S1 |
| E1-S4 🔴 | Loop | Property purchase step wired to the state machine | `property_purchase` | M | 📋 | E1-S2 |
| E2-S1 🔴 | Money | Seller payout destination, per-seller bank account | `payouts` | L | 📋 | E1-S4, D2 |
| E2-S2 🔴 | Money | Webhook idempotency, replay and freshness guard | — | M | 📋 | none |
| E2-S3 | Money | Gateway refunds, not ledger-only | `payouts` | M | 📋 | E2-S1 |
| E2-S4 🔴 | Money | Production guard on payment mock mode | — | S | 📋 | none |
| E2-S5 | Money | Finance reconciliation view | — | M | 📋 | E2-S1, E4-S1 |
| E3-S1 🔴 | Trust | Authorized document access, retire the public static route | `secure_docs` | M | 📋 | none |
| E3-S2 🔴 | Trust | Durable object storage in production | — | M | 📋 | D4 |
| E3-S3 | Trust | Upload hardening: type allow-list, magic bytes, AV hook | `secure_docs` | M | 📋 | E3-S2 |
| E3-S4 | Trust | Public PoA verification page | — | S | 📋 | none |
| E4-S1 🔴 | Access | Enforce PermissionsGuard on every privileged endpoint | — | M | 📋 | none |
| E4-S2 | Access | KYC gate on money-moving actions | `kyc_gate` | M | 📋 | E1-S4, D3 |
| E4-S3 | Access | Cross-role authorization test suite | — | M | 📋 | E4-S1 |
| E5-S1 🔴 | Security | Rate limiting and lockout on auth and payments | — | M | 📋 | none |
| E5-S2 🔴 | Security | CORS allow-list from configuration | — | S | 📋 | none |
| E5-S3 | Security | Password reset | `auth_recovery` | M | 📋 | E6-S1 |
| E5-S4 | Security | Email verification on self-registration | `auth_signup` | M | 📋 | E6-S1 |
| E5-S5 | Security | Session management: refresh rotation and revocation | `auth_sessions` | L | 📋 | none |
| E6-S1 🔴 | Comms | SMTP configuration and delivery observability | — | S | 📋 | none |
| E6-S2 | Comms | Email channel for notification types | `email_notifications` | M | 📋 | E6-S1 |
| E6-S3 | Comms | Transactional email templates for the core journeys | `email_notifications` | M | 📋 | E6-S2 |
| E7-S1 | Ops | Structured logging, correlation id, error tracking | — | M | 📋 | none |
| E7-S2 | Ops | Coverage thresholds and a CI coverage gate | — | S | 📋 | none |
| E7-S3 🔴 | Ops | End-to-end journeys in CI against an ephemeral database | — | L | 📋 | E7-S2 |
| E7-S4 | Ops | Deterministic demo seed and reset | — | M | 📋 | E3-S2 |
| E7-S5 | Ops | Runbook, environment matrix, secrets checklist | — | S | 📋 | none |
| E7-S6 | Ops | Health and readiness probes with dependency checks | — | S | 📋 | none |
| E8-S1 | Compliance | NDPR consent, retention, and erasure | `privacy_centre` | L | 📋 | E5-S5 |
| E8-S2 | Compliance | Legal review of the PoA instrument and terms | — | S | ⛔ | external |
| E8-S3 | Compliance | Pre-launch security review | — | S | ⛔ | external, E4-S3 |
| E8-S4 | Compliance | Public web surface: robots, sitemap, per-route metadata | — | M | 📋 | none |

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

### 3.2 Go-live gates

| Gate | Meaning | Owner | Blocked by |
| --- | --- | --- | --- |
| G1 | A buyer completes the on-platform journey on staging without staff intervention | Engineering | E1 |
| G2 | A test payout reaches a distinct seller account and a test refund is repaid by the gateway | Engineering plus Finance | E2 |
| G3 | No private document is reachable without authorization, verified by an unauthenticated probe suite | Security | E3, E4-S3 |
| G4 | Signed PoA instrument and terms of service approved by counsel | Client, external | E8-S2 |
| G5 | Independent security review closed with no high findings outstanding | External | E8-S3 |
| G6 | Escrow and settlement model confirmed against CBN and AML obligations | Client, external | D2 |

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

**Note.** This is a one-day story and it removes the single worst failure mode in the money path. It should be picked up in the first idle slot regardless of milestone order.

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

**Size** M · **Flag** `secure_docs` · **Deps** none

**Evidence of the gap**

`backend/src/main.ts:23` mounts `app.use("/uploads", express.static(resolveUploadRoot()))` before any guard. `backend/src/storage/storage.service.ts:58` to `:63` returns `/uploads/{key}` for the local driver, which is the default (`STORAGE_DRIVER` defaults to `local` at `storage.service.ts:40`). `vite.config.ts` proxies `/uploads` straight through in development. Every KYC document (`kyc.service.ts:77`, `:133`), professional credential (`professionals.service.ts:263`), listing document, and DD report resolves to a public path. Anyone who obtains a storage key can fetch the file with no session.

**Acceptance criteria**

1. `GET /documents/:id/content` streams a document after an ownership and privilege check, and is the only path by which private files are reachable.
2. The unauthenticated static `/uploads` mount is removed. Public listing imagery, if it must stay public, moves to a separate public prefix that only ever holds listing media.
3. Direct requests to a private key without a session return 404.
4. Every access writes an audit row with actor, document, and outcome.
5. A probe test walks every document category as an anonymous client and as a wrong-role client, and asserts 404 on all of them.
6. Behind `secure_docs`, with a documented rollback that re-enables the old path for one release only.

---

#### E3-S2, durable object storage in production

> **As** a buyer, **I want** the report I downloaded yesterday to still be there today, **so that** the platform's documents are permanent records.

**Size** M · **Flag** none · **Deps** D4

**Evidence of the gap**

`backend/src/storage/storage.service.ts:22` to `:30`: when running on Vercel with a relative or unset upload directory, the local root becomes `/tmp/safebuyrealties-uploads`. Vercel serverless `/tmp` does not persist between invocations. `backend/.env.example` lists the S3 variables. This entry used to cite `backend/.env.vercel.prod` as proof that production sets no `STORAGE_DRIVER` and no AWS keys; that file has since been untracked, and it never supported the claim — it holds `VERCEL_*`/`TURBO_*` build metadata and carries no `DATABASE_URL` either, which production certainly has. **The production storage driver is not knowable from this repository and must be read from the Vercel dashboard.** If it is `local`, uploads written in production are effectively write-only.

**Acceptance criteria**

1. `STORAGE_DRIVER=s3` is required in production. The application refuses to start on a serverless platform with the local driver.
2. Bucket policy denies public reads. All access is through pre-signed URLs from E3-S1.
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

Ownership checks are written per service, for example `escrow.service.ts` `assertCanViewEscrow`, `documents.service.ts` `toDocumentDto`, and `listings-public.helper.ts`. They are correct where they exist and there is no systematic check that they exist everywhere. voxdiary solves the same class of problem with a fail-closed data-layer extension rather than per-service checks, which is the direction to move once this suite exists to protect the refactor.

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

**Acceptance criteria**

1. Short-lived access token, 15 minutes or less, with a rotating refresh token.
2. Refresh tokens are stored hashed, rotate on use, and reuse of a spent token revokes the whole family and raises a security alert.
3. `GET /auth/sessions` lists a user's active sessions with device and last-seen, and `DELETE /auth/sessions/:id` revokes one.
4. Password change, password reset, and KYC rejection all revoke every other session.
5. Refresh failure returns 401 with the same shape whether the token is expired, revoked, or fabricated.
6. Behind `auth_sessions` with a documented rollback, since this touches every authenticated request.

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

**Size** S · **Deps** none

**Evidence of the gap.** `backend/jest.config.js` sets `collectCoverageFrom` and no `coverageThreshold`. `vitest.config.ts` configures no coverage at all. `.github/workflows/ci.yml` runs `npm test` without coverage. Nothing prevents coverage from falling.

**Acceptance criteria**

1. Both suites run with coverage in CI and publish a report artifact.
2. A ratchet: new and changed files must meet the strict bar, the repository floor may not fall below its current measured level.
3. The gate is a required status check on `main`, wired to the existing `ci-gate` job.
4. The current baseline is measured and recorded in the pull request that adds the gate, so the ratchet has a starting point.

---

#### E7-S3, end-to-end journeys in CI

**Size** L · **Deps** E7-S2

**Evidence of the gap.** `scripts/` holds six end-to-end scripts including `journey-e2e-all-roles.mjs` and `listing-lifecycle-e2e.mjs`, and `.github/workflows/ci.yml` runs none of them. Playwright is already a dependency and is driven directly by `scripts/e2e-portals.mjs` and `scripts/dd-checklist-e2e.mjs`, with no `playwright.config` and no test runner around it. The scripts also require a live shared cloud database, which is why they cannot run in CI as written. `AGENTS.md` warns never to run `prisma migrate reset` against it.

**Acceptance criteria**

1. CI provisions an ephemeral Postgres, migrates it, and seeds it. No pipeline touches the shared cloud database.
2. The existing scripts are converted to run against the ephemeral instance.
3. Five journeys run per pull request: buyer on-platform purchase, seller listing to live, staff verification, standalone due diligence, and guest checkout.
4. Payments run against Paystack test keys or a stubbed gateway, chosen explicitly, never against live keys.
5. Failures produce logs and screenshots as artifacts.
6. The suite finishes in under ten minutes or is split so the pull request path stays under ten minutes.

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

---

#### E7-S6, health and readiness probes

**Size** S · **Deps** none

**Evidence of the gap.** `backend/src/health/health.controller.ts` is a single `@Get()`. It does not check the database, storage, or the payment gateway, so a healthy response can coexist with a broken deployment.

**Acceptance criteria**

1. `/health/live` answers without touching dependencies.
2. `/health/ready` checks database, object storage, and payment gateway configuration, and returns per-dependency state.
3. Neither endpoint leaks versions, keys, or connection strings.
4. Readiness failure marks the instance unavailable rather than serving errors.

---

### Epic E8, compliance and go-live

---

#### E8-S1, NDPR consent, retention, and erasure

**Size** L · **Flag** `privacy_centre` · **Deps** E5-S5, EXT-5

**Evidence of the gap.** No consent model, no retention policy, and no erasure path exist in the schema or the codebase. The platform stores government identity documents, selfies, and professional credentials. voxdiary treats the equivalent as `FR-A6` and `FR-A7` with a dedicated privacy centre, and it is worth reading `docs/adr/0004-auth-and-account-portal.md` there before designing this.

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
3. Medium findings are either fixed or tracked with an owner and an SLA, following the ratchet pattern in voxdiary's ADR-0013.
4. A re-test confirms closure before G5.

---

#### E8-S4, public web surface

**Size** M · **Deps** none

**Evidence of the gap.** There is no `public/` directory in the repository, so there is no `robots.txt`, no `sitemap.xml`, and no favicon set. Public routes do not set per-route titles, descriptions, canonicals, or structured data. For a property marketplace, organic discovery of listing pages is a primary acquisition channel.

**Acceptance criteria**

1. Public routes are server rendered with content in the initial HTML, verified by fetching with JavaScript disabled.
2. Unique title, description, canonical, and Open Graph tags per public route, including each listing.
3. `robots.txt` and a generated `sitemap.xml` covering live listings only.
4. `RealEstateListing` JSON-LD on listing detail pages.
5. Every dashboard and private route is `noindex`.
6. Core Web Vitals measured on the listing detail page and recorded as a baseline.

---

## 5. Cross-cutting definition of done

Every story above is done when all of the following hold. This is voxdiary's `rules.md` §1, ratcheted to new and touched code.

1. One story, one pull request, single purpose, conventional-commit title, squash merged.
2. Behind its declared feature flag where one is given, with the flag defaulting off and a documented kill switch.
3. No unhandled 5xx. Every failure maps to the correct 4xx or a deliberate 502 with a correlation id.
4. Structured logs on every new endpoint or job, carrying the correlation id, never PII, secrets, documents, or account numbers.
5. Tests cover the happy path and every rejected path. New and changed files meet the coverage ratchet from E7-S2.
6. Input validated on client and server against the same rules. Validation failures return 4xx with a machine-readable code.
7. Authorization is server side and fail closed. Hiding a control in the UI is never the control.
8. Docs updated in the same pull request: `docs/BUILD_CHECKLIST.md`, `README.md` where behaviour changed, and an ADR when a real decision was made.
9. `npm run validate:tsc`, `npm test`, `cd backend && npm test`, and `npx eslint src --max-warnings 0` all clean, with no warnings suppressed to get there.
10. Root cause fixed, with a regression test. No band-aid, no suppression, no disabled test.

---

## 6. Suggested sequencing

**One developer, about 15 to 19 weeks.** Follow the critical path in section 3.1, and use the unblocked quick wins as filler while waiting on external inputs.

**Two developers, about 8 to 10 weeks.**

- Developer A owns the loop and the money: E1 in full, then E2, then E4-S2 and E2-S5.
- Developer B owns trust, access, and platform: E3 in full, then E4-S1 and E4-S3, then E5, E6, E7.
- They meet at E7-S3, which needs both halves working, and at the go-live gates.
- The only hard cross-dependency is E1-S3 needing E3-S1, so B should land E3-S1 in week one.

**First week, whoever is on shift.** DOCS-1, E2-S4, E5-S2, E6-S1, E3-S4. Five small stories, about four days, and between them they close the worst silent-failure mode in the money path, the credential-reflecting CORS policy, the silently dropped email, and the QR code that has always pointed at a 404.

---

## 7. What this backlog does not cover

Deliberately out of scope for MVP, carried forward as a Phase 2 statement of work, consistent with the bucketing in `docs/analysis/05_STRATEGIC_RECOMMENDATIONS.md` §1.3 and §1.4:

Agent and broker role with leads, offers, and commission. In-app messaging and case chat. Support ticketing. Seller, agent, and business analytics beyond the finance reconciliation in E2-S5. Saved searches and map-based discovery. Professional earnings and fee disbursement. Flutterwave as a second gateway, noting that `PlatformConfig.flutterwaveEnabled` exists in the schema with no adapter behind it. Two-factor authentication for staff and admin. Build-phase professional orchestration. AI document verification and fraud indicators. A mobile field application.

Each is cleanly extractable from the current architecture, which is the strongest thing this codebase has going for it.
