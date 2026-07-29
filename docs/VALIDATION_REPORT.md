> **⚠️ STALE, do not act on this file.** A production snapshot dated 2026-05-25, two months before the last commit on `main`. Its "Not built" list is largely built now. Current state: [`HANDOVER.md`](HANDOVER.md). Retained as history. (Banner added 2026-07-29.)

# Validation report (snapshot)

> **Current workflow:** validate on **local** stack — see [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). This file is a historical production snapshot (2026-05-25); re-run checks on localhost after major changes.

**Date:** 2026-05-25  
**Target:** https://safebuyrealties-app.vercel.app (app) + API via `/api/v1` rewrite  
**Method:** Automated API script (`scripts/validate-e2e-claims.mjs`), manual API probes, browser smoke on Vercel.

---

## Summary

| Verdict | Count | Meaning |
| ------- | ----- | ------- |
| **Works E2E** | 8 flows | API + UI path verified on production |
| **Partial** | 6 flows | Wired but broken config, missing API, or UI stubs |
| **Not built** | — | PoA, DD wizard, escrow, catalog, notifications, KYC, etc. (Step 2+) |

**Recommendation:** Fix items in § “Blockers before Step 2” (includes fixes in this commit), redeploy backend/frontend, re-run `npm run smoke:api` and staff/pro task URLs.

---

## Works end-to-end (verified)

| Flow | Evidence |
| ---- | -------- |
| Login (buyer, seller, staff, admin, professional) | API + browser staff session |
| Register buyer/seller | FE sends `role: BUYER` / `SELLER`; API accepts |
| Buyer browse LIVE listings | 7 LIVE listings returned |
| Buyer list transactions | 2 transactions for seed buyer |
| Buyer start transaction | POST succeeds or 409 if already reserved |
| Seller list own listings | 7 listings for `seller@` |
| Admin list users / listings | 10 users, 7 listings |
| Professional task list + KPI filters | 2 tasks; `PENDING`/`IN_PROGRESS`/`COMPLETED` filters OK |

---

## Partial (not fully E2E)

| Flow | Issue |
| ---- | ----- |
| **Staff dashboard / workflow / submissions queue** | `useStaffQueueQuery` requested `pageSize=200`; API max 100 → error “pageSize must not be greater than 100”. **Fixed in repo** (`pageSize=100`). Needs deploy. |
| **Staff approve / assign** | Seed DB has **all listings LIVE** — nothing in `PENDING_REVIEW` / `IN_VERIFICATION` to approve or assign. APIs exist; **workflow not exercisable** on current data. |
| **Buyer payment (mock)** | Production has `PAYSTACK_SECRET_KEY` set but **invalid** → Paystack returns “Invalid key”. Mock path only runs when secret is **empty**. Clear key or use valid key. |
| **Professional task detail (direct URL)** | FE calls `GET /tasks/me/:id`; backend had no route → **404**. **Fixed in repo** (`getMineById`). Needs deploy. |
| **Listing detail** | Loads; **Start transaction** works for LIVE. **Make an offer** / **Schedule visit** disabled or stub. Hero = Unsplash placeholder; beds/baths/area = "—" (schema fields not added yet). |
| **Seller submit for review** | UI wired; only from DRAFT/REJECTED — seed listings are LIVE, so **cannot re-test submit** without creating a new draft. |

---

## Step 1 (stabilize dashboards)

| Item | Status |
| ---- | ------ |
| `useTaskKpiCounts` + enum fix | **Pass** (API filters) |
| `useCreateTaskMutation` | **Pass** (exported) |
| Staff workflow hooks | **Pass** code; **Fail** UI until pageSize fix deployed |
| Staff submissions approve | **Pass** code; **Cannot verify** on LIVE-only seed data |
| CI | **Pass** (file exists; run on push) |

---

## Not built (original plan — Steps 2–11)

PoA, DD catalog & wizard, dual payment intents, escrow, notifications, KYC gate, object storage, audit, platform config, messaging, advanced search, saved properties, inspections, analytics dashboards.

---

## Commands to re-validate after deploy

```bash
npm run validate:tsc
npm run smoke:api
node scripts/validate-e2e-claims.mjs
```

Browser: `docs/demo-script-checklist.md` on https://safebuyrealties-app.vercel.app

---

## Blockers before Step 2

1. **Deploy** staff `pageSize` fix + `GET /tasks/me/:id`.
2. **Paystack:** unset invalid `PAYSTACK_SECRET_KEY` on backend Vercel project for mock payments, or set a valid test key.
3. **Optional:** Reseed or add one `PENDING_REVIEW` listing so staff approve/assign can be tested on production.
