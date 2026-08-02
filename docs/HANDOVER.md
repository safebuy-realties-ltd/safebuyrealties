# SafeBuyRealties, handover

**Read this first.** One page on what is really here, what is not, and where the traps are.
Audited against `main` @ `fc05e1e` on 2026-07-29 by reading the code, not the checklists.

| Question | Answer |
| --- | --- |
| What is the work queue? | [`MVP_OUTSTANDING_BACKLOG.md`](MVP_OUTSTANDING_BACKLOG.md). 36 stories, acceptance criteria, a file and line behind every gap claim |
| What is the board? | [`mvp-board.html`](mvp-board.html), filterable, open it in a browser |
| Is `BUILD_CHECKLIST.md` trustworthy? | As history yes, as a queue no. See its Audit corrections section |
| What is the north star? | `docs/analysis/02_MASTER_PRD.md`. Still valid |
| What is stale? | `TECH_AUDIT.md`, `VALIDATION_REPORT.md`, `analysis/03`, `analysis/04`. Each now carries a banner |

---

## What is genuinely built

This is a real product, further along than the May analysis pack suggests. Working end to end:

Six-role identity with separate login portals and a unified admin portal carrying named admin roles and a
privilege catalogue. Listing lifecycle across ten statuses with spec fields, media, server-side search filters,
saved properties. Verification workflow where staff assign professionals, professionals submit reports with risk
flags, and staff accept or request revision. Service catalog with bundles and VAT from platform config. A
seven-step due diligence purchase wizard that resumes from session storage. Power of Attorney execution with PDF,
SHA-256 hash, QR, and an immutable record. Escrow ledger with hold, release conditions, release, refund and payout
rows. **Standalone due diligence, the strongest flow in the product**, covering guest or authenticated request,
professional assignment, per-assignment reports, staff verdict and completion. KYC records with a staff review
queue. In-app notifications. Inspection scheduling, platform config, audit logging, human-readable SBR IDs,
maintenance mode.

104 route handlers across 26 controllers. 30 Prisma models. 61 frontend routes.

## What will bite the next team

**One. The on-platform journey dead-ends.** `DueDiligenceService` has exactly one method, `create()`. Orders
raised against a platform listing get no queue, no assignment, no report and no completion, so nothing ever sets
the transaction to `DD_COMPLETE`. The buyer's own screen gates the property purchase on that status
(`dashboard.buyer.transactions.tsx:225`), so escrow is never funded and the seller is never paid. The complete
lifecycle exists, but only in `standalone-dd` (1590 lines), where the property is off-platform. **The product
sells due diligence well and cannot yet sell a house.** Do not solve this by copying `standalone-dd.service.ts`;
extract the shared machinery. Stories E1-S1 to E1-S4.

**Two. The money is not safe to switch on.** Payouts resolve the destination bank account from two environment
variables that default to Paystack's test account, so every seller is paid to the same place
(`paystack.service.ts:119`). Refunds update a row and never call the gateway. The payment webhook has no replay
guard, so a duplicated callback re-fires notifications and escrow holds. If the Paystack key is absent in
production, payouts are silently recorded as completed. Stories E2-S1 to E2-S4.

**Three. Private documents are public.** `main.ts:23` mounts `/uploads` as unauthenticated static, ahead of every
guard. Any storage key fetches a title deed, a government ID or a KYC selfie with no session. On Vercel those
files also land in ephemeral `/tmp`, so production uploads do not survive. For a platform selling document trust,
this is the finding to close first. Stories E3-S1 and E3-S2.

## Traps that waste a day if you do not know them

- **Two due diligence paths exist.** `source` is `LISTING` or `STANDALONE`. Almost every admin, buyer and
  professional DD screen reads the standalone hooks only. Check which path you are in before debugging.
- **Privileges gate menus, not endpoints.** `PermissionsGuard` is applied on two controllers. Everything else uses
  coarse `@Roles(STAFF, ADMIN)`, and the seed gives Content Manager, Finance Manager and Operations Officer all
  `UserRole.ADMIN`. A content manager can call `POST /escrow/:id/release`.
- **Payment ids live in `localStorage`.** `dashboard.buyer.transactions.tsx:112` and `:254`. Clearing the browser
  loses the link between a transaction and its payment.
- **Never run `prisma migrate reset`.** The database is a shared cloud Postgres used by local dev, previews and
  production. See `AGENTS.md`.
- **Email is log-only everywhere.** `SMTP_*` is absent from `.env.example`, so `EmailService` logs and returns.
- **The E2E scripts in `scripts/` are not in CI** and need the shared cloud database, which is why.
- **Seeded documents point at storage keys with no files**, so demos show an Unsplash placeholder. QA-015.

## Quality posture, stated honestly

CI runs TypeScript compile, ESLint with zero warnings, and unit tests, path-filtered behind one required gate.
There is no coverage threshold, no static analysis gate, no mutation testing, and no end-to-end test in CI. 24
backend spec files and 7 frontend test files, mostly around library helpers. The codebase is clean and readable
with very few TODOs; the gap is verification, not craft.

The backlog proposes raising this as a **ratchet on new and touched code only**, not retroactively.

## Decisions the next team inherits

Recorded as ADRs in `docs/adr/`. None are engineering's to make alone. One has been made: **D1 was answered on
2026-08-02**, and the other four are open.

**D1 is settled. Buying a property on the platform is part of the MVP.** It asked whether the on-platform
purchase was in scope or whether standalone due diligence was the MVP, and answering "standalone only" would
have removed most of epics E1 and E2 and about 20 days. The stakeholders chose to keep it, so the purchase
wizard gets finished rather than retired, escrow and the Power of Attorney get a journey that reaches them, and
E1's four stories are startable. `docs/adr/0001-mvp-scope-envelope.md` is Accepted and carries the reasoning.
One thing that answer did not do is fix anything: the wizard still takes payment into a transaction that stops
dead, and it does so until E1-S4 merges. **D2** does SafeBuyRealties hold client funds, which decides
whether seller payouts are a bank-details form or a regulated flow with CBN and AML obligations. **D3** KYC by
manual review or by a provider. **D4** object storage provider and region, which is on the critical path.
**D5** adopt the quality ratchet.

## If you have one day

Read this file, open `mvp-board.html`, then run the stack per `LOCAL_DEVELOPMENT.md` and walk the standalone due
diligence flow at `/due-diligence`. It is the one journey that works end to end, and seeing it is the fastest way
to understand what the product is meant to be.
