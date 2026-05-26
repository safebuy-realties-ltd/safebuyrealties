# QA / stabilization findings log

> **Goal:** Fix everything here before new PRD/checklist features. One agent owns this file per sprint.

## Stabilization sprint — 2026-05-26 — `cursor/stabilization-e4ea-b52e`

### Executive summary

The product had **broad FE/BE contract drift**: UI was built ahead of APIs, layout routes double-wrap dashboards, uploads are stored but not served, and staff listing workflows skip `PENDING_REVIEW`. This sprint addresses P0/P1 items with minimal correct diffs; preview E2E verified on Vercel deployment `dpl_B87PAWGAAnqUWPwm2WQWuM6xawsb`.

### Environment

| Field | Value |
|-------|-------|
| Stack | Preview FE `safebuyrealties-qbi3f30pt-…vercel.app`, BE `safebuyrealties-o1yc6nyd5-…vercel.app`, cloud Postgres |
| Branch | `cursor/stabilization-e4ea-b52e` |
| Local note | `DATABASE_URL` not injected in cloud agent env — local `:8080`/`:3001` E2E blocked; preview used for Gate C |

---

### Issue backlog

| ID | Sev | Area | Route / API | Problem | Root cause (code) | Status |
|----|-----|------|-------------|---------|-------------------|--------|
| QA-001 | P0 | Layout | All `/dashboard/*` child routes | Nested dashboard (2× sidebar, 2× header) | Child routes wrap `DashboardLayout` while parent `dashboard.{role}.tsx` already does | **fixed** |
| QA-002 | P1 | Listings | `/dashboard/seller/listings` | Rows not clickable to detail | Plain `<div>` rows, no `Link` | **fixed** |
| QA-003 | P1 | Listings | `/listings/$id` loader | Hard refresh 403 for seller draft | SSR loader has no auth cookie; `canAccessListing` blocks non-LIVE | **fixed** (removed SSR loader; client fetch with cookie) |
| QA-004 | P1 | Media | `/uploads/*`, listing hero | Uploaded docs/images 404 | No static serve in `main.ts`; Vite only proxies `/api/v1` | **fixed** |
| QA-005 | P1 | Media | Listing detail | Hero broken when `listing_hero` doc exists | Buyers omit `storageKey` in DTO; URL becomes `/uploads/undefined` | **fixed** (hero/gallery keys exposed to buyers) |
| QA-006 | P1 | Staff | `/dashboard/staff/submissions` | Cannot advance `PENDING_REVIEW` | `approve()` only handles ASSIGNED→…; no PENDING_REVIEW→ASSIGNED | **fixed** |
| QA-007 | P1 | Verification | `GET /verification/listing/:id/activity` | Activity log always errors | FE hook exists; **no backend route** | **fixed** |
| QA-008 | P1 | Verification | Staff workflow step Reject | 400 on patch | FE sends status `REJECTED`; enum has `BLOCKED` | **fixed** |
| QA-009 | P1 | Verification | Staff assign pro | Assign fails on fresh seed | `assertProfessionalVerified` but seed has no verified profiles | **fixed** (seed + `ensureVerifiedProfessionalProfiles` upsert) |
| QA-010 | P1 | Tasks | `PATCH /tasks/:id` from pro task UI | Report submit fails | FE sends `completionNotes`, `checklist`, `report` — not in `PatchTaskDto` | **fixed** |
| QA-011 | P2 | Tasks | Pro task detail UI | Evidence/revision UI never populated | FE types fields backend does not return | open |
| QA-012 | P2 | Buyer | `/dashboard/buyer` cards | beds/baths show 0 | `toListingCard` hardcodes zeros | open |
| QA-013 | P2 | Listings | Listing detail CTA | “Verification status” wrong destination | Navigates to buyer listings, not per-listing | open |
| QA-014 | P2 | Admin | `/dashboard/admin/settings` | Placeholder while API exists | UI not wired to platform-config | open |
| QA-015 | P2 | Seed | Documents | Seeded docs don't display | `storageKey: seed/...` with no files on disk | open |
| QA-016 | P1 | Payments | Buyer transactions + Paystack | Not validated E2E | Needs test keys in `backend/.env` + live popup test | **partial** — production has Paystack; local popup blocked without DATABASE_URL |
| QA-017 | P2 | Product | `/purchase/:id` | DD wizard missing | Step 10 not built — **defer**, not stabilization | deferred |

**Fix order:** QA-001 → QA-004/005 → QA-006–010 → QA-002/003/012–016 → re-run full matrix in `VISUAL_QA_AGENT_PROMPT.md`.

---

### Paystack test run

| Field | Value |
|-------|-------|
| Keys in `backend/.env` | `PAYSTACK_TEST_SECRET_KEY` + `PAYSTACK_TEST_PUBLIC_KEY` set locally; `DATABASE_URL` empty in cloud agent |
| Popup opened | Not run locally (no local backend) |
| Payment succeeded | Not run this session |
| Verify endpoint | Available on production API (`POST /payments/:id/verify`) |
| Transaction / listing status after pay | — |

---

### Verification matrix (post-fix retest)

| Flow | Pass | Notes |
|------|------|-------|
| Seller: create listing + specs + open detail | ✓ | Preview: single sidebar; row → detail |
| Seller: upload docs + submit PENDING_REVIEW | — | Not re-tested on preview this session |
| Staff: PENDING_REVIEW → ASSIGNED → … → LIVE | ✓ | Preview: PENDING_REVIEW → ASSIGNED confirmed |
| Staff: workflow assign, revision, accept | partial | Reject → BLOCKED verified; assign not re-tested |
| Pro: credentials verified, task report submit | — | QA-009 seed fix; existing cloud DB may need staff verify or upsert |
| Buyer: browse, open listing, start tx, Paystack | partial | Buyer dashboard layout verified; Paystack not live-tested |
| Admin: change listing status, users list | — | Not re-tested this session |

---

### Historical / product debt (do not block stabilization PR)

- DD purchase wizard (Step 10)
- Notifications bell (no backend)
- KYC, escrow, PoA
- `docs/BUILD_CHECKLIST.md` out of sync with `main` — update after stabilization
