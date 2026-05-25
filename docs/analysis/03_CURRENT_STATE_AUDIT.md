# 03 — Current State Audit

**SafeBuyRealties · Strategic Definition Engagement · Phase 3 of 5**
Prepared for: Goodness Olajide (Corne Labs, Technical Lead)
Prepared by: Senior Product Architect
Date: 2026-05-23

---

## 0. Method, honesty note & legend

This audit documents **what exists in the active `safebuyrealties` repository today**, measured
against the Master PRD (`02_MASTER_PRD.md`). It is deliberately blunt: Goodness needs accurate
information, and this document is written so it could be shown to the client without
embarrassment.

Findings were produced by walking the codebase and were **independently verified** for the
highest-impact claims (file:line cited where verified). Two prior assertions are explicitly
corrected here:

- The **client requirements doc** claims "digital Power of Attorney execution is live" and "all
  dashboards are functional." **Both are inaccurate** against the actual build (see §1, §2.4).
  This was flagged as conflict C8 in Phase 1.
- The repo's own **`docs/TECH_AUDIT.md` (2026-05-02) is stale**: it predates the transactions/
  payments work and the move to HttpOnly-cookie auth. Where it disagrees with this audit, this
  audit is current.

**Status legend:** ✅ implemented & working · 🟡 partial (works with gaps) · 🔴 not implemented ·
🐛 implemented but broken · 🎭 mock/static (UI exists, no real backend).

---

## 1. Executive summary

**The backend is a genuinely solid LOE-shaped core; the frontend is ~75% wired but has three
role-critical pages that crash on load; and the entire "trust layer" of the Master PRD — PoA,
escrow, separated payments, audit, messaging, notifications — does not exist yet.**

What works end-to-end today: register/login (secure HttpOnly-cookie sessions), seller listing
creation + document upload + submit-for-review, the staff-driven verification _template_ and step
APIs, buyer browse → start transaction → Paystack payment (mock-capable) with an escrow-style
timeline, professional **task detail** report submission, and admin user/listing management.

What is broken today (verified): **`/dashboard/professional` and `/dashboard/professional/tasks`
crash on mount** (they call an undefined `useTaskKpiCounts()` during render); **`/dashboard/staff/
workflow` crashes on mount** (calls undefined `useCreateTaskMutation()` at render and references
an undefined `patchStepMutation`); **`/dashboard/staff/submissions`** renders but its approve/
publish button throws on click (undefined `approve()`). Net effect: **the professional role's
dashboard is non-functional and the staff verification workflow is unusable**, even though their
backend APIs are sound. This directly contradicts the "dashboards operational" claim.

What is entirely missing vs the Master PRD: **Power of Attorney + document integrity (hash/QR/
PDF)**, **true escrow ledger + disbursement/payouts**, **separation of DD-service vs property-
purchase payments**, the **DD service catalog / bundles / VAT**, **in-app messaging**,
**notifications beyond toasts**, **audit logging**, **inspection scheduling**, **saved/liked +
advanced search**, the **Agent/Broker** and **Super Admin** roles, **KYC records**, **listing
media**, and **Flutterwave** (only Paystack is integrated).

**Bottom line:** the build delivers roughly the LOE's structural MVP (auth, listings,
verification workflow, tasks, a basic transaction + Paystack), but is **missing the entire set of
features that make SafeBuyRealties distinctive and trustworthy**, and currently ships **three
broken role-critical screens**. The foundation is good enough to build on; the gap to the
north-star is large but well-defined (Phase 4 sizes it).

| Area                                                                       | Verdict                       |
| -------------------------------------------------------------------------- | ----------------------------- |
| Backend core (auth, listings, verification, tasks, transactions, payments) | ✅ solid foundation           |
| Frontend buyer & seller & admin flows                                      | 🟡 mostly wired & working     |
| Frontend professional & staff workflow screens                             | 🐛 crash on mount / on action |
| PoA, escrow, separated payments, audit, messaging, notifications           | 🔴 absent                     |
| Tests                                                                      | 🔴 none                       |
| Security hardening (uploads, rate limiting, audit, refresh)                | 🟡/🔴 several gaps            |

---

## 2. Frontend audit (page by page, role by role)

Stack: React 19, Vite, TanStack Router (file-based) + Query, Tailwind v4, Radix/shadcn. Auth via
HttpOnly `sbr_session` cookie validated on mount through `/auth/me`. Data flows through
TanStack Query; components are presentational. **18 routes.**

### 2.1 Public

| Route           | File                             | Verdict   | Notes                                                                                                                                                                              |
| --------------- | -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`             | `routes/index.tsx`               | 🎭 static | Hardcoded marketing copy ("12,000+ verified…"); no API                                                                                                                             |
| `/login`        | `routes/login.tsx`               | ✅        | `POST /auth/login`, cookie session, role redirect                                                                                                                                  |
| `/register`     | `routes/register.tsx`            | 🟡        | `POST /auth/register` but **Buyer/Seller only** (Agent/Professional self-reg from PRD/demo absent)                                                                                 |
| `/listings/$id` | `routes/listings.$listingId.tsx` | 🟡        | Real loader `GET /listings/:id` + auth-gated docs/verification; "Make an offer"/"Schedule visit" buttons are disabled stubs; specs (beds/baths/area) render "—" (no schema fields) |

### 2.2 Buyer — ✅ the strongest role

| Route                           | Verdict | Notes                                                                                                                                        |
| ------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard/buyer`              | ✅      | Stats + previews from `GET /listings` + `GET /transactions/me`                                                                               |
| `/dashboard/buyer/listings`     | ✅      | Live listings; client-side search/sort/filter                                                                                                |
| `/dashboard/buyer/transactions` | ✅      | `GET /transactions/me`; **`POST /payments/initiate`**; polls `GET /payments/:id` every 5s; escrow-style timeline; mock-capable via `?mock=1` |

Buyer gaps vs PRD: no DD purchase **wizard**, no **PoA**, no **service catalog/bundles**, no
saved/liked, no advanced/map search, no messaging — i.e., the buyer can start a bare transaction
and pay, but the entire DD purchase experience the demo centers on is absent.

### 2.3 Seller — 🟡 solid core

| Route                         | Verdict | Notes                                                                                                                                                                    |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/dashboard/seller`           | ✅      | Owned listings + first-listing documents preview; create-draft form                                                                                                      |
| `/dashboard/seller/listings`  | ✅      | Create listing (`POST /listings`), list owned                                                                                                                            |
| `/dashboard/seller/documents` | ✅      | Drag-drop upload (`POST /documents/upload`), per-type required-doc tracking, **submit-for-review** (`PATCH /listings/:id` → PENDING_REVIEW), verification status display |

Seller gaps: no listing **media** upload (hero/gallery), no inquiries/offers, no payouts, no
messaging.

### 2.4 Property Professional — 🐛 dashboard broken

| Route                                   | Verdict                 | Notes                                                                                                                                                         |
| --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard/professional`               | 🐛 **crashes on mount** | `dashboard.professional.tsx:40` calls `useTaskKpiCounts()`, imported (`:6`) from `@/hooks/use-tasks` but **never exported/defined** → TypeError during render |
| `/dashboard/professional/tasks`         | 🐛 **crashes on mount** | `dashboard.professional.tasks.tsx:55` same undefined `useTaskKpiCounts()`                                                                                     |
| `/dashboard/professional/tasks/$taskId` | ✅                      | Works: `GET /tasks/me/:id`, `PATCH /tasks/:id`, evidence upload via `POST /documents/upload`                                                                  |

So a professional can open a **direct task-detail link** and submit a report, but their **landing
dashboard and task list are dead on arrival**. Missing vs PRD regardless: credential/regulator
profile, appointments/schedule, earnings/fees, messaging, risk-flag UI.

### 2.5 Internal Staff — 🐛 verification workflow broken

| Route                          | Verdict                  | Notes                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard/staff`             | ✅                       | Pipeline stats from `GET /listings`; read-only                                                                                                                                                                                                                                          |
| `/dashboard/staff/workflow`    | 🐛 **crashes on mount**  | `dashboard.staff.workflow.tsx:75` calls undefined `useCreateTaskMutation()` (imported `:20`, never defined); also references undefined `patchStepMutation` (`:122,:255,:264`) — the correct hook `usePatchVerificationStepMutation` exists in `use-verification.ts` but is not wired in |
| `/dashboard/staff/submissions` | 🐛 approve action throws | Renders & reads queue, but `:99` button calls `approve(l.id,l.status)` which is **never defined** → ReferenceError on click                                                                                                                                                             |

Net: **staff cannot run the verification pipeline from the UI** (assign → approve/reject),
despite the backend supporting it. Missing vs PRD: KYC processing, document review tooling,
support tickets, audit-aware actions.

### 2.6 Administrator — ✅ functional, narrow

| Route                       | Verdict | Notes                                                                                           |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `/dashboard/admin`          | ✅      | Totals from `GET /users` + `GET /listings`; notes "payments/revenue not aggregated in this MVP" |
| `/dashboard/admin/users`    | ✅      | Paginated users; **role change** via `PATCH /users/:id`                                         |
| `/dashboard/admin/listings` | ✅      | Status moderation via `PATCH /listings/:id` (Review/Live/Reject)                                |

Missing vs PRD: justified-override logging, KYC/compliance, escrow/pricing/integration config
(those belong to Super Admin, which doesn't exist), analytics, audit-log access. **No Agent/Broker
or Super Admin surfaces exist at all.**

### 2.7 Design system

✅ Mature and consistent: Radix/shadcn (~53 components), OKLCH brand green (~`#0B6B3A`), `sonner`
toasts, responsive, good loading/error states. Aligns with the demo's calm/intentional intent,
though it is plainer than the client's emerald/Playfair demo styling.

---

## 3. Backend audit (module by module, endpoint by endpoint)

Stack: NestJS, Prisma, PostgreSQL 16, Passport-JWT (HttpOnly cookie + Bearer), bcryptjs, Helmet,
Multer. Global `/api/v1`, `{data, meta}` envelope, global validation pipe + exception filter.
**10 modules.**

| Module           | Endpoints                                                                                     | Verdict | Notes                                                                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **auth**         | `POST /auth/register`, `/login`, `/logout`, `GET /auth/me`                                    | ✅      | bcrypt(10), JWT 7d in HttpOnly cookie; register restricted to BUYER/SELLER. No refresh token, no password reset, no email verification                                                                                                             |
| **users**        | `GET /users` (staff/admin), `GET /:id`, `PATCH /:id`                                          | ✅      | Role-based visibility; staff-only role/professionalType changes                                                                                                                                                                                    |
| **listings**     | `POST`, `GET`, `GET /:id`, `PATCH /:id`, `DELETE /:id`                                        | ✅      | Full CRUD; **role-based visibility**; **status-transition guardrails** per role; **auto-creates 8-step verification template** on PENDING_REVIEW; sets `verifiedAt`                                                                                |
| **documents**    | `POST /documents/upload`, `GET /documents/listing/:id`                                        | 🟡      | Local-disk storage (`UPLOAD_DIR/...`); 15MB limit; filename sanitized; **no MIME/type validation** (`documents.service.ts` stores `file.mimetype` unchecked); role/assignment-scoped access                                                        |
| **verification** | `POST /verification/assign`, `GET /verification/listing/:id`, `PATCH /verification/steps/:id` | ✅      | Seller marks SUBMISSION; staff assign pros to steps; status/notes/riskFlags patch; completedAt auto-set                                                                                                                                            |
| **tasks**        | `POST /tasks` (staff/admin), `GET /tasks/me` (pro), `PATCH /tasks/:id`                        | ✅      | Assignee must be PROFESSIONAL; due-date ordering; self-update                                                                                                                                                                                      |
| **payments**     | `POST /payments/initiate`, `GET /payments/:id`, webhook `POST /webhooks/payments/paystack`    | 🟡      | **Paystack only** (no Flutterwave); **mock mode** auto-succeeds when `PAYSTACK_SECRET_KEY` unset; HMAC-SHA512 signature verify; idempotency via unique `providerReference`; couples to Transaction. No replay/freshness window; REFUNDED never set |
| **transactions** | `POST /transactions`, `GET /transactions/me`, `GET /:id`                                      | 🟡      | Buyers only; LIVE-only; prevents duplicate active tx; lifecycle INITIATED→IN_PROGRESS→COMPLETED. **No DD vs purchase distinction; no cancel/expiry; no escrow**                                                                                    |
| **health**       | `GET /health`                                                                                 | ✅      |                                                                                                                                                                                                                                                    |
| **prisma**       | —                                                                                             | ✅      | Global; clean separation                                                                                                                                                                                                                           |

**Absent backend modules vs PRD:** notifications, messaging, escrow/ledger/payout, audit log,
PoA/document-integrity, inspection scheduling, service catalog, KYC, RBAC config, password reset.

---

## 4. Database audit (Prisma schema vs Master PRD)

Models present (★): User, Listing, Document, VerificationStep, Task, Transaction, Payment. Enums
are sensible. Gaps measured against §7 of the Master PRD:

| PRD need                                      | Schema today                                                                                    | Gap                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 7 roles                                       | `UserRole` = BUYER/SELLER/PROFESSIONAL/STAFF/ADMIN                                              | 🔴 **no SUPER_ADMIN, no AGENT/BROKER**                           |
| Professional credentials                      | `ProfessionalType` enum only                                                                    | 🔴 no regulator/license/expiry/verified (no ProfessionalProfile) |
| KYC                                           | —                                                                                               | 🔴 no KycRecord                                                  |
| Status lifecycle (Under Offer/Sold)           | `ListingStatus` = DRAFT/PENDING_REVIEW/ASSIGNED/IN_VERIFICATION/VERIFIED/LIVE/REJECTED/ARCHIVED | 🟡 vocabulary mismatch; **no UNDER_OFFER / SOLD** states         |
| Step rejection/needs-info                     | `VerificationStepStatus` = PENDING/IN_PROGRESS/COMPLETED/**BLOCKED**                            | 🟡 **no REJECTED** at step level (FE DTO assumes it)             |
| Risk flags                                    | `VerificationStep.riskFlags` Json                                                               | ✅ present (untyped)                                             |
| Listing media                                 | Document only                                                                                   | 🔴 no ListingMedia (hero/gallery)                                |
| DD service catalog/bundles                    | —                                                                                               | 🔴 none                                                          |
| DD order / PoA                                | —                                                                                               | 🔴 no DueDiligenceOrder, no PowerOfAttorney (hash/qr/pdf)        |
| Two payment intents                           | `Payment` (no intent field)                                                                     | 🔴 no DD-vs-purchase intent                                      |
| Escrow + payout                               | `PaymentStatus` has REFUNDED (unused)                                                           | 🔴 no Escrow, no Payout, no commission                           |
| Inspection/appointment                        | —                                                                                               | 🔴 none                                                          |
| Messaging                                     | —                                                                                               | 🔴 none                                                          |
| Notification                                  | —                                                                                               | 🔴 none                                                          |
| Audit log                                     | —                                                                                               | 🔴 none (critical for the "everything auditable" principle)      |
| RBAC/permission config                        | —                                                                                               | 🔴 none                                                          |
| Platform config (escrow/pricing/integrations) | —                                                                                               | 🔴 none                                                          |

Other schema notes: `Task.documentId` is defined but **never populated** (dead field); good
composite indexes exist (`Listing[sellerId,status]`, `Task[assigneeId,status]`); no uniqueness on
`VerificationStep(listingId,type)` (service enforces it, DB doesn't); seed creates all roles + 18
listings across every status + tasks/transactions/payments (excellent for demo).

---

## 5. Integration audit (frontend ↔ live backend)

| Surface                                | Wiring                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| Auth (login/register/me/logout)        | ✅ live                                                                             |
| Buyer browse / transactions / payment  | ✅ live (payment mock-capable)                                                      |
| Seller listings / documents / submit   | ✅ live                                                                             |
| Professional task **detail**           | ✅ live                                                                             |
| Admin users / listings                 | ✅ live                                                                             |
| Professional **dashboard + task list** | 🐛 crash before any call resolves (undefined hook)                                  |
| Staff **workflow**                     | 🐛 crash on mount; assign API exists but unreachable; approve/reject hook not wired |
| Staff **submissions**                  | 🐛 reads live; approve action undefined                                             |
| Listing detail "offer"/"schedule"      | 🔴 disabled stubs                                                                   |
| Landing                                | 🎭 static                                                                           |

Contract alignment is otherwise good: `{data, meta}` envelope honored; auth/cookie handling
correct; one latent risk — the FE `VerificationStepDto` includes a `REJECTED` status the backend
enum cannot produce.

---

## 6. Architectural observations

- **Clean, conventional architecture** on both ends: NestJS domain modules (controller/service/
  DTO/guard) sharing a global Prisma service; FE with a typed API client, per-domain query/
  mutation hooks, and presentational routes. Easy to extend.
- **Server-as-source-of-truth auth** (HttpOnly cookie + `/auth/me` hydration) is a sound choice
  and an improvement over the localStorage-JWT approach the stale `TECH_AUDIT.md` described.
- **Workflow-consistency instinct is good** (auto verification-template on submit) — the backend
  "thinks in workflows," which matches the product's governance principle.
- **The broken FE screens point to a process gap, not a design flaw**: hooks were referenced
  before being implemented and there is no type-check/test gate to catch it (these are also TS
  errors that a CI `tsc`/lint step would have blocked).
- **No domain layer for money/legal integrity** yet — escrow, payment intent, and document
  integrity are cross-cutting concerns that will need deliberate modeling, not bolt-ons.

---

## 7. Quality concerns (security, performance, code health)

**Security**

- 🔴 **Document storage on local disk** with **no MIME/type whitelist, no malware scanning**, no
  signed-URL retrieval — for a platform handling title documents this is both a security and a
  multi-instance-deployment problem.
- 🔴 **No audit trail** — directly violates the requirements doc's "every action time-stamped and
  auditable" and the legal-comments expectations.
- 🟡 **Auth**: no refresh-token rotation, no password reset, no email verification, no 2FA; 7-day
  JWT widens the theft window.
- 🟡 **Payments**: webhook signature-verified and idempotent by unique reference, but **no replay/
  timestamp-freshness protection**; **mock mode could be silently enabled in production** if the
  Paystack key is unset (no startup guard).
- 🔴 **No rate limiting** anywhere (login, register, payment-init, upload brute-force/DoS surface).
- 🟡 **NDPR**: no documented retention/consent/erasure handling; phone/PII stored plaintext.
- ✅ Prisma parameterization (no SQL injection), Helmet/HSTS, CORS allowlist, global validation
  (whitelist + transform) are correctly in place.

**Performance / scalability**

- 🟡 Local-disk documents break horizontal scaling; needs object storage.
- 🟡 FE lists fetch large `pageSize` (e.g. 150–200) and filter client-side; backend supports
  pagination/filters that the FE doesn't fully use.
- 🔴 No background jobs/queues (notifications, payment reconciliation, document processing).

**Code health**

- 🔴 **Zero automated tests** (no `*.spec.ts`) — high regression risk; the live FE crashes would
  have been caught by a build/type gate.
- 🟡 Dead/loose ends: `Task.documentId` unused; FE imports of non-existent hooks; `zod` present
  but unused for validation; `wrangler.jsonc` suggests a Cloudflare target not reflected
  elsewhere.

---

## 8. What's genuinely good (call it out)

- **A real, role-aware backend**, not a CRUD toy: listing **status-transition guardrails** by
  role, **role-scoped visibility** across listings/documents/verification, and **auto-generated
  verification workflow** on submission.
- **Secure session model** (HttpOnly cookies, server-validated) done right.
- **Working payment path with a mock mode** — demoable without live Paystack keys, with webhook
  signature verification and idempotency.
- **End-to-end buyer + seller happy paths** actually function (list → document → submit; browse →
  transact → pay), and **professional task submission** (with evidence upload) works.
- **Excellent seed data** spanning every role and every listing status — a strong base for demos
  and tests.
- **Clean, consistent, responsive UI** and a tidy, conventional architecture that is pleasant to
  extend.
- The build is **meaningfully ahead of the repo's own last audit** (transactions/payments now
  exist; auth hardened), showing real forward progress.

> Three small, well-localized fixes (export/define `useTaskKpiCounts`, `useCreateTaskMutation`,
> and wire `usePatchVerificationStepMutation`/`approve()`) would immediately restore the
> professional dashboard and the staff verification workflow — these are **quick wins**, sized in
> Phase 4.

---

## 9. Phase 3 conclusion & what's next

The active build is a **credible LOE-shaped MVP skeleton with a strong backend**, but it (a) ships
**three broken role-critical screens** and (b) lacks **the entire trust/legal/money layer** that
defines SafeBuyRealties in the Master PRD. The client's "PoA live / dashboards operational" claim
does not hold; the honest position is documented above.

**Next (Phase 4, on approval):** `04_GAP_ANALYSIS.md` — every Master-PRD acceptance criterion
mapped to a current-state finding, each gap categorized (net-new / completion / bug-fix /
integration / data / polish) and **T-shirt sized**, with a dependency graph, risk register,
critical path, and quick wins (starting with the three broken screens).

> **Stop point — awaiting Goodness's review of this Current State Audit before advancing to
> Phase 4.**
