# Visual QA + fix agent — master prompt

Copy everything below the line into a **new Cursor agent session** on this repo. The agent must **run locally**, **record every defect**, and **fix bugs** (starting with the known nested-dashboard issue).

---

## Mission

Perform **exhaustive visual and functional QA** of SafeBuyRealties on the **local stack**, then **fix** all confirmed bugs. Cross-check behavior against:

- `docs/BUILD_CHECKLIST.md` (intended features)
- `docs/demo-script-checklist.md` (role journeys)
- `docs/analysis/02_MASTER_PRD.md` (product intent — read relevant sections only)

Deliverable: **`docs/QA_FINDINGS.md`** (living log) + **PR(s)** with fixes on branch `cursor/visual-qa-fixes-e4ea`.

---

## Environment setup (do this first)

```bash
git checkout main && git pull origin main
git checkout -b cursor/visual-qa-fixes-e4ea
```

### Backend `backend/.env` (never commit)

Copy from `backend/.env.example` and set:

```env
DATABASE_URL="<cloud postgres url from team>"
DATABASE_POSTGRES_URL="<same as DATABASE_URL>"
SBR_CONFIRM_CLOUD_DATABASE_URL=true
JWT_SECRET="local-dev-jwt-min-32-characters-long"
PORT=3001
FRONTEND_URL="http://localhost:8080,http://localhost:5173"
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./uploads

# Paystack TEST keys (user-provided — do NOT commit to git)
PAYSTACK_TEST_SECRET_KEY="<paste sk_test_...>"
PAYSTACK_TEST_PUBLIC_KEY="<paste pk_test_...>"
PAYSTACK_SECRET_KEY=""
```

```bash
cd backend && npx prisma generate && npx prisma migrate deploy
cd backend && npm run start:dev   # terminal 1 — :3001
npm run dev                       # terminal 2 — :8080
```

Gate A before UI work:

```bash
npm run validate:tsc && npm test && cd backend && npm test && npm run smoke:api
```

Use **browser MCP / computerUse** for all L5 checks on `http://localhost:8080`.

---

## Known defect (fix first — P0)

**Symptom:** After login (e.g. seller), the main content area shows **a second full dashboard** — duplicate sidebar, duplicate top bar (search, bell, avatar).

**Root cause:** Parent layout routes already wrap children in `DashboardLayout` + `<Outlet />`:

- `src/routes/dashboard.seller.tsx`
- `src/routes/dashboard.buyer.tsx`
- `src/routes/dashboard.staff.tsx`
- `src/routes/dashboard.professional.tsx`
- `src/routes/dashboard.admin.tsx`

Several **child** routes incorrectly wrap **again** in `<DashboardLayout role="...">`. Index routes (`dashboard.*.index.tsx`) are correct (content only). Child routes must **only** render page content (use `PageHeader`, etc.), **not** another `DashboardLayout`.

**Files to audit and fix (remove inner `DashboardLayout`, keep page component):**

- `dashboard.seller.listings.tsx`, `dashboard.seller.documents.tsx`
- `dashboard.buyer.listings.tsx`, `dashboard.buyer.transactions.tsx`, `dashboard.buyer.services.tsx`
- `dashboard.staff.submissions.tsx`, `dashboard.staff.workflow.tsx`, `dashboard.staff.credentials.tsx`
- `dashboard.professional.tasks.tsx`, `dashboard.professional.tasks.$taskId.tsx`, `dashboard.professional.credentials.tsx`
- `dashboard.admin.users.tsx`, `dashboard.admin.listings.tsx`

**Validation:** Seller → My Listings → **one** sidebar only. Repeat for buyer, staff, pro, admin child routes.

---

## QA findings log

Create/update **`docs/QA_FINDINGS.md`** with this structure for **every** issue:

```markdown
## QA run — YYYY-MM-DD — branch cursor/visual-qa-fixes-e4ea

### Summary
- Environment: local :8080 / :3001, cloud DB
- Roles tested: seller, buyer, staff, pro, admin

### Issues

| ID | Severity | Role | Route | Steps | Expected | Actual | Status | PR/commit |
|----|----------|------|-------|-------|----------|--------|--------|-----------|
| QA-001 | P0 | seller | /dashboard/seller/listings | ... | single layout | nested dashboard | fixed | abc123 |

### Paystack test run
- Keys: test mode
- Transaction ID:
- Payment ID:
- Result:

### Checklist / PRD gaps (not bugs — product debt)
- ...
```

Update the table as you go. Mark **fixed** only after re-test on localhost.

---

## Parallel workstreams (optional sub-agents)

If using multiple agents, **only one** edits `DashboardLayout` / route layout files at a time. Suggested split:

| Agent | Scope | Focus |
|-------|--------|--------|
| **A** | Layout fix + seller | P0 nesting, seller flows, documents, specs |
| **B** | Staff + professional | submissions, workflow, revision, credentials, tasks |
| **C** | Buyer + Paystack | listings, transactions, services, live checkout |
| **D** | Admin + integration | users, listings, settings vs API; cross-role E2E |

Merge to one branch; single `docs/QA_FINDINGS.md`.

---

## Test accounts

Password for all: **`password123`**

| Role | Email |
|------|-------|
| Seller | seller@safebuyrealties.test |
| Buyer | buyer@safebuyrealties.test |
| Staff | staff@safebuyrealties.test |
| Professional | lawyer@safebuyrealties.test |
| Admin | admin@safebuyrealties.test |

---

## Exhaustive QA checklist — every role

For **each route**, verify: page loads, **no console errors**, **single dashboard chrome**, every **button/link** either works or is documented as intentional stub.

### Public

| Route | Actions to click/test |
|-------|------------------------|
| `/` | Nav links, CTAs, login/register |
| `/login` | Submit valid/invalid; redirect by role |
| `/register` | Buyer/seller registration if enabled |
| `/listings/$id` | Start transaction, disabled CTAs, verification tracker, gallery/docs |

### Seller — `/dashboard/seller/*`

| Route | Click everything |
|-------|------------------|
| `/dashboard/seller` | Stat cards, quick actions, listing links, create CTA |
| `/dashboard/seller/listings` | Create form (all fields including specs), submit, listing rows |
| `/dashboard/seller/documents` | Listing selector, upload, submit for review |

### Buyer — `/dashboard/buyer/*`

| Route | Click everything |
|-------|------------------|
| `/dashboard/buyer` | Overview cards, links to listings/transactions |
| `/dashboard/buyer/listings` | Filters, search, listing cards, open detail |
| `/dashboard/buyer/transactions` | **Pay deposit** → Paystack popup → complete test payment → verify |
| `/dashboard/buyer/services` | Each bundle card, à la carte checkboxes, totals/VAT |

### Staff — `/dashboard/staff/*`

| Route | Click everything |
|-------|------------------|
| `/dashboard/staff` | Overview |
| `/dashboard/staff/submissions` | Approve/reject per listing |
| `/dashboard/staff/workflow` | Assign pro, patch step, risk badges, accept, request revision |
| `/dashboard/staff/credentials` | Approve/reject professional |

### Professional — `/dashboard/professional/*`

| Route | Click everything |
|-------|------------------|
| `/dashboard/professional` | KPI cards |
| `/dashboard/professional/tasks` | Filters, open task |
| `/dashboard/professional/tasks/$taskId` | Risk flags, notes, submit, resubmit after revision |
| `/dashboard/professional/credentials` | Save profile |

### Admin — `/dashboard/admin/*`

| Route | Click everything |
|-------|------------------|
| `/dashboard/admin` | Overview |
| `/dashboard/admin/users` | List, actions |
| `/dashboard/admin/listings` | Status filters |
| `/dashboard/admin/settings` | Note if still placeholder — file gap vs `GET /platform-config` API |

---

## Paystack live test (required)

**Preconditions**

- `PAYSTACK_TEST_SECRET_KEY` set in `backend/.env` (backend reads test key when production key empty)
- `platform-config` has `paystackEnabled: true` (default)
- Backend restarted after env change

**Flow**

1. Login as **buyer**
2. Open a **LIVE** listing → **Start transaction**
3. `/dashboard/buyer/transactions` → find transaction → click **Pay** / deposit button
4. Expect: Paystack **inline popup** (not mock toast)
5. Use Paystack **test card** (see Paystack docs — e.g. success card `4084084084084081`, CVV/expiry per their test table)
6. On success: toast “Payment confirmed”; transaction status updates; payment row `SUCCEEDED`
7. Call or wait for `POST /payments/:id/verify` — confirm in Network tab
8. Record payment ID, reference, listing/transaction status in `QA_FINDINGS.md`

**If popup does not open:** check Network `POST /payments/initiate` response for `accessCode`; check console; confirm `accessCode` passed to `openPaystackCheckout` in `dashboard.buyer.transactions.tsx`.

**If mock path runs instead:** backend returned `authorizationUrl` with `mock=1` — secret key not loaded; fix env and restart API.

---

## Cross-role integration flows

Execute end-to-end and record in QA_FINDINGS:

1. **Seller lists → staff approves → goes LIVE → buyer sees listing**
2. **Buyer starts transaction → Paystack pay → status changes** (DD_PURCHASED / UNDER_OFFER if implemented)
3. **Staff assigns pro → pro submits report with risk flags → staff revision → pro resubmit → accept**
4. **Pro submits credentials → staff verifies → pro sees Verified**
5. **Buyer services page** — bundle selection totals correct (15 services, VAT 7.5%)

---

## Fix policy

1. **P0/P1:** Fix in this session (layout nesting, crashes, payment blocked)
2. **P2:** Fix if small; else log with clear repro
3. **Product gaps** (wizard missing, admin settings stub, notification bell inert): log under “Checklist / PRD gaps”, do not mark as QA failures unless copy promises feature

**Per fix:** regression test on localhost; add Vitest/Jest if trivial to prevent recurrence.

**Do not:** commit `.env`, commit Paystack keys, run `prisma migrate reset` on cloud DB.

---

## Git / PR

```bash
git push -u origin cursor/visual-qa-fixes-e4ea
```

PR title: `fix(qa): dashboard layout nesting + visual QA findings`

PR body must include:

- Link to `docs/QA_FINDINGS.md`
- Summary of fixes vs deferred items
- Paystack test evidence (screenshot or reference + status transition)
- Commands run: `validate:tsc`, `test`, smoke, manual routes

---

## Definition of done

- [ ] P0 nested dashboard fixed on all affected child routes
- [ ] `docs/QA_FINDINGS.md` complete with all routes exercised
- [ ] Paystack test payment succeeded once on localhost (or documented blocker)
- [ ] CI green (`validate:tsc`, FE/BE tests)
- [ ] PR opened against `main`

---

## Read order

1. This file
2. `docs/LOCAL_DEVELOPMENT.md`
3. `docs/AGENT_PROMPT.md`
4. `docs/BUILD_CHECKLIST.md` (Steps 1–5 for expected behavior)
5. Relevant route files under `src/routes/`

Begin with **P0 layout fix**, then **Paystack test**, then full role matrix above.
