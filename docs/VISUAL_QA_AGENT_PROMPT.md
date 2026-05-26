# Stabilization sprint — QA + fix agent (master prompt)

Copy everything below into a **new agent session**. This is **not** a shallow click-through — it is a **product stabilization sprint**: find every broken or partial flow, **fix it**, then prove E2E on localhost before any new PRD/checklist work.

---

## Mission

**Make the current platform actually work** for all five roles on the code already merged to `main` (Steps 1–5 partial). The user reports: nested dashboards, listings broken, verification broken, status changes broken, uploads broken, payments untested — **“everything is partially built.”**

Your job:

1. **Discover** — exhaustive local QA + code audit; log in `docs/QA_FINDINGS.md`
2. **Fix** — P0/P1 first; minimal correct diffs; TDD where cheap
3. **Prove** — re-test every flow in the matrix; Paystack live once
4. **Ship** — PR `cursor/stabilization-e4ea` → `main`; update checklist notes only for items you truly fixed E2E

**Do not** start Step 6+ (PoA, escrow, wizard) until stabilization PR merges.

---

## Read first

1. `docs/QA_FINDINGS.md` — **pre-seeded backlog** (start here, add rows)
2. `docs/LOCAL_DEVELOPMENT.md` — local stack, cloud DB, no Docker
3. `docs/AGENT_PROMPT.md` + `docs/BUILD_CHECKLIST.md` — intended behavior
4. `docs/demo-script-checklist.md` — role journeys
5. `docs/analysis/02_MASTER_PRD.md` — cross-check critical journeys (sections on verification, listings, payments)

---

## Environment

```bash
git checkout main && git pull origin main
git checkout -b cursor/stabilization-e4ea
```

`backend/.env` (gitignored — never commit):

- `DATABASE_URL` + `DATABASE_POSTGRES_URL` (cloud Postgres)
- `SBR_CONFIRM_CLOUD_DATABASE_URL=true`
- `JWT_SECRET` (32+ chars)
- `FRONTEND_URL=http://localhost:8080,...`
- Paystack test keys (user provides):
  - `PAYSTACK_TEST_SECRET_KEY=sk_test_...`
  - `PAYSTACK_TEST_PUBLIC_KEY=pk_test_...`
  - `PAYSTACK_SECRET_KEY=` (empty)

```bash
cd backend && npx prisma generate && npx prisma migrate deploy
cd backend && npm run start:dev   # :3001
npm run dev                       # :8080
```

Gate A: `npm run validate:tsc && npm test && cd backend && npm test && npm run smoke:api`

Use **browser / computerUse** on `http://localhost:8080`. Open DevTools Console + Network for every flow.

---

## Phase 0 — Fix known P0/P1 (do before exploratory QA)

Pre-identified in `docs/QA_FINDINGS.md`:

### QA-001 — Nested dashboard (P0)

Remove inner `<DashboardLayout>` from child routes; parents already provide layout + `<Outlet />`:

- `dashboard.seller.listings.tsx`, `dashboard.seller.documents.tsx`
- `dashboard.buyer.listings.tsx`, `dashboard.buyer.transactions.tsx`, `dashboard.buyer.services.tsx`
- `dashboard.staff.submissions.tsx`, `dashboard.staff.workflow.tsx`, `dashboard.staff.credentials.tsx`
- `dashboard.professional.tasks.tsx`, `dashboard.professional.tasks.$taskId.tsx`, `dashboard.professional.credentials.tsx`
- `dashboard.admin.users.tsx`, `dashboard.admin.listings.tsx`

Pattern: export page component directly (like `dashboard.seller.index.tsx`).

### QA-004/005 — Uploads visible (P1)

- Serve `uploads` from Nest (`main.ts` static middleware or dedicated controller)
- Proxy `/uploads` in `vite.config.ts` → backend in dev
- Fix buyer document DTO / listing hero URL when `storageKey` missing

### QA-006 — Staff PENDING_REVIEW → ASSIGNED (P1)

`dashboard.staff.submissions.tsx`: allow approve from `PENDING_REVIEW` to `ASSIGNED` (align with `listings.service` transitions).

### QA-007 — Verification activity API (P1)

Implement `GET /verification/listing/:listingId/activity` **or** remove FE hook usage.

### QA-008 — Step reject status (P1)

Align FE `REJECTED` with backend `BLOCKED` (or add enum value + migration).

### QA-009 — Pro assignment on seed (P1)

Seed verified `ProfessionalProfile` for `lawyer@` **or** document staff must verify credentials first.

### QA-010 — Task report PATCH (P1)

Extend `PatchTaskDto` + `tasks.service` to accept report fields FE sends **or** trim FE payload to match DTO.

### QA-002/003 — Listing navigation (P1)

- Seller listings: link rows to `/listings/$id`
- Listing detail: fix SSR/auth for seller drafts (cookie in loader or client-only fetch)

After Phase 0, re-run smoke + quick role sanity before Phase 1.

---

## Phase 1 — Deep visual QA (every role, every control)

Log **every** defect in `docs/QA_FINDINGS.md` (ID, severity, repro, expected, actual, status).

**Rules:**

- Click **every** nav item, button, tab, filter, dialog
- If a button does nothing → bug (unless documented stub: “Make an offer”, “Schedule visit”)
- If API 4xx/5xx in Network → bug
- If console error → bug
- Compare to PRD/checklist intent → log “gap” separately from “bug”

### Accounts (`password123`)

| Role | Email |
|------|-------|
| Seller | seller@safebuyrealties.test |
| Buyer | buyer@safebuyrealties.test |
| Staff | staff@safebuyrealties.test |
| Pro | lawyer@safebuyrealties.test |
| Admin | admin@safebuyrealties.test |

### Route matrix (complete)

**Public:** `/`, `/login`, `/register`, `/listings/$id`

**Seller:** `/dashboard/seller`, `/seller/listings`, `/seller/documents`

**Buyer:** `/dashboard/buyer`, `/buyer/listings`, `/buyer/transactions`, `/buyer/services`

**Staff:** `/dashboard/staff`, `/staff/submissions`, `/staff/workflow`, `/staff/credentials`

**Pro:** `/dashboard/professional`, `/professional/tasks`, `/professional/tasks/$id`, `/professional/credentials`

**Admin:** `/dashboard/admin`, `/admin/users`, `/admin/listings`, `/admin/settings`

### Cross-role E2E (required after fixes)

1. Seller: create listing (specs) → upload title_deed + survey_plan → submit **PENDING_REVIEW**
2. Staff: submissions → **ASSIGNED** → workflow assign verified pro → step progress → accept report
3. Pro: credentials verified → task → risk flags → submit report → handle revision if requested
4. Staff: advance listing to **LIVE**
5. Buyer: see listing → start transaction → **Paystack test payment** → status updates
6. Admin: override status if needed; platform-config via API (wire UI if time)

---

## Phase 2 — Paystack live test (required)

1. Buyer → LIVE listing → Start transaction
2. `/dashboard/buyer/transactions` → Pay deposit
3. Expect Paystack **inline popup** (not “demo / no key” toast)
4. Paystack test card → success → `POST /payments/:id/verify` → transaction status + payment SUCCEEDED
5. Record IDs in `QA_FINDINGS.md`

If mock path runs: restart backend; confirm `PAYSTACK_TEST_SECRET_KEY` loaded.

---

## Phase 3 — Hardening

- Add regression tests for fixed bugs (layout smoke optional; API contract tests for task patch, listing transitions)
- Run full Gate A
- Update `docs/BUILD_CHECKLIST.md` Last Session Notes + mark `[x]` only for items verified E2E post-fix
- Optional: refresh `docs/VALIDATION_REPORT.md` snapshot

---

## Parallel sub-agents (optional)

| Agent | Owns | Must not touch |
|-------|------|----------------|
| **A** | QA-001 layout + seller flows | BE verification |
| **B** | Uploads QA-004/005 + documents | layout files |
| **C** | Staff/pro verification QA-006–011 | payments |
| **D** | Buyer + Paystack QA-016 | staff files |

Merge into one branch; single `QA_FINDINGS.md`; one coordinator runs E2E matrix last.

---

## Fix policy

| Severity | Action |
|----------|--------|
| **P0** | Fix in sprint PR |
| **P1** | Fix in sprint PR |
| **P2** | Fix if ≤2h else log with clear repro |
| **Product debt** (wizard, notifications) | Log only; do not block merge |

**Never:** commit `.env`, Paystack keys, `prisma migrate reset` on shared DB.

---

## PR requirements

- Branch: `cursor/stabilization-e4ea`
- Title: `fix: stabilization sprint — dashboards, verification, uploads, listings, payments`
- Body: link `docs/QA_FINDINGS.md`, list fixes by QA-ID, Paystack evidence, test commands
- CI green before merge

---

## Definition of done

- [ ] All P0/P1 in `QA_FINDINGS.md` fixed or explicitly waived with user sign-off
- [ ] Cross-role E2E matrix passes on localhost
- [ ] Paystack test payment succeeded once
- [ ] No nested dashboard on any child route
- [ ] `npm run validate:tsc` + FE/BE tests pass
- [ ] PR open against `main`

**Success = user can demo seller → staff → pro → buyer (with payment) without “this is broken” surprises.**

Begin with **Phase 0** using the pre-seeded table in `docs/QA_FINDINGS.md`.
