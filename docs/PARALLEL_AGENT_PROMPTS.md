# Parallel Agent Prompt Pack

**Baseline as of 2026-05-26** — `main` includes Step 1 complete, Step 2 items through **audit logging** and **object storage** (`[x]`). See `docs/BUILD_CHECKLIST.md` for live status.

**Coordinator:** Run at most **3 agents in Wave 1**, then **4 in Wave 2** after schema merges. One PR owns `backend/prisma/schema.prisma` at a time.

---

## Coordinator checklist (run once per wave)

- [ ] `git pull origin main` on all agents
- [ ] Assign non-overlapping branches (`cursor/<topic>-e4ea`)
- [ ] Schema PR merges first; others rebase before push
- [ ] After wave merge: `npm run validate:tsc`, `npm test`, `cd backend && npm test`, `npm run smoke:api`
- [ ] Gate C at end of Step 2: `docs/demo-script-checklist.md` on Vercel preview
- [ ] Update `docs/BUILD_CHECKLIST.md` Last Session Notes + `[x]` only for items you validated

**Production gotchas** (`docs/VALIDATION_REPORT.md`): staff queue `pageSize` ≤ 100; seed listings mostly `LIVE` (hard to test approve flow); unset invalid `PAYSTACK_SECRET_KEY` for mock payments.

**API base:** `https://safebuyrealties-app.vercel.app/api/v1` or PR preview API URL.

**Seed password:** `password123` — `admin@`, `staff@`, `seller@`, `buyer@`, `lawyer@` `@safebuyrealties.test`

---

## Wave 1 — Finish Step 2 (3 parallel tracks)

| Track | Branch | Checklist item | Schema owner? |
| ----- | ------ | -------------- | ------------- |
| **W1-A** | `cursor/step2-platform-config-e4ea` | Platform configuration | **Yes** |
| **W1-B** | `cursor/step2-spec-fields-fe-e4ea` | Property spec fields — frontend | No |
| **W1-C** | `cursor/step3-listing-status-db-e4ea` | Listing status vocabulary — database | **Yes — merge after W1-A or combine migrations in one PR** |

**Recommendation:** Merge **W1-A** before **W1-C**, or let **W1-A** agent add `UNDER_OFFER`/`SOLD` in the same migration PR to avoid schema contention.

---

## Wave 2 — Step 3 (4 parallel tracks, after Wave 1)

| Track | Branch | Checklist item | Depends on |
| ----- | ------ | -------------- | ---------- |
| **W2-A** | `cursor/step3-listing-status-fe-e4ea` | Listing status vocabulary — frontend | W1-C merged |
| **W2-B** | `cursor/step3-pro-credentials-e4ea` | Professional credential profile | Platform config optional; own schema PR |
| **W2-C** | `cursor/step3-risk-flags-ui-e4ea` | Risk flag taxonomy and picker UI | None (FE + lib) |
| **W2-D** | `cursor/step3-report-revision-loop-e4ea` | Report acceptance and revision loop | Own schema PR — **serialize with W2-B** if both touch verification enums |

---

## Wave 3 — Step 4 (2 parallel tracks, after platform config)

| Track | Branch | Checklist item |
| ----- | ------ | -------------- |
| **W3-A** | `cursor/step4-service-catalog-api-e4ea` | Service catalog — database and seed + API endpoints |
| **W3-B** | `cursor/step4-service-selector-fe-e4ea` | Service catalog — frontend selection UI |

**W3-B** starts after W3-A exposes `GET /service-catalog/bundles` contract (or mock types from OpenAPI/DTO in PR description).

---

## Shared preamble (paste at top of every agent prompt)

```markdown
You are a senior full-stack engineer on **SafeBuyRealties**. Follow `docs/AGENT_PROMPT.md` and `docs/DEVELOPMENT_GUIDE.md` exactly.

## Already done — do NOT rebuild
- Step 1 (all dashboard crash fixes, CI)
- Step 2: listing spec/media schema, **object storage**, **audit logging**

## Rules
- Read `docs/BUILD_CHECKLIST.md` for your item only
- Branch from latest `main`; never push to `main`
- TDD: failing tests first
- Mark `[x]` only after L1 + L2 + L4 (+ L5 if UI)
- One checklist item per PR unless schema+migration only
- After `prisma/schema.prisma` change: `cd backend && npx prisma generate` before `validate:tsc`
- Do not run `prisma migrate reset`
- Match existing patterns: `backend/src/listings/listings.service.ts`, `src/hooks/use-listings.ts`, `src/lib/api.ts`
```

---

## W1-A — Platform configuration

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W1-A — Platform configuration
- **BRANCH:** `cursor/step2-platform-config-e4ea`
- **CHECKLIST:** Step 2 → **Platform configuration** only
- **SCHEMA OWNER:** Yes — you own the only schema PR in Wave 1 unless coordinator combines W1-C enum into your migration

## Do not edit
- `backend/src/storage/**`, `backend/src/audit/**`, `backend/src/documents/**`
- Seller listing form / listing detail (W1-B)

## Implement
1. `PlatformConfig` singleton in `backend/prisma/schema.prisma` per checklist
2. Migration `*_platform_config`
3. `backend/src/platform-config/` — service (60s cache, upsert on get), controller
4. `GET /platform-config` (authenticated), `PATCH /platform-config` (ADMIN)
5. Register module in `app.module.ts`
6. Tests: `platform-config.service.spec.ts` (and controller test if pattern exists)

## Optional (same PR if small)
- Wire `DocumentsService` max upload to `getMaxUploadBytes()` later — only if checklist scope allows; otherwise skip

## Validation
- `npm run validate:tsc`, `cd backend && npm test`
- Deploy preview; `curl` GET with auth cookie — document response in PR
- PATCH as admin; confirm cache invalidation via second GET

## PR title
`feat(step2): platform configuration singleton API`

## Done when
- Checklist item `[x]`, Last Session Notes updated
```

---

## W1-B — Property spec fields (frontend)

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W1-B — Property spec fields frontend
- **BRANCH:** `cursor/step2-spec-fields-fe-e4ea`
- **CHECKLIST:** Step 2 → **Property spec fields — frontend** only
- **NO schema changes** — backend fields already exist

## Do not edit
- `backend/**` except if you find a serialization bug (then minimal BE fix + test)
- `backend/prisma/schema.prisma`

## First step: validate existing code
Files likely already implemented — verify before adding code:
- `src/hooks/use-listings.ts` (`beds`, `baths`, `landAreaSqm`, `buildType`)
- `src/routes/dashboard.seller.listings.tsx` (form + POST payload)
- `src/routes/listings.$listingId.tsx` (display)

If complete, add/extend Vitest tests and run E2E on preview only.

## Validation (L5 required)
1. Login as `seller@safebuyrealties.test` / `password123`
2. Create listing with beds=4, baths=3
3. Open listing detail — spec row shows "4 beds" and "3 baths"
4. `npx tsc`, `npm test`, no console errors on touched routes

## PR title
`feat(step2): validate listing spec fields on seller create and detail`

## Done when
- E2E described in PR body with preview URL
- Checklist `[x]`
```

---

## W1-C — Listing status enum (database)

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W1-C — Listing status vocabulary database
- **BRANCH:** `cursor/step3-listing-status-db-e4ea`
- **CHECKLIST:** Step 3 → **Listing status vocabulary — database** only
- **COORDINATE:** Wait for W1-A platform-config migration to merge OR stack enum in W1-A PR if coordinator approves

## Do not edit
- `src/lib/listing-status.ts` (W2-A)
- Other Step 3 features

## Implement
1. Add `UNDER_OFFER`, `SOLD` to `ListingStatus` enum
2. Migration only — no data backfill required
3. Confirm `cd backend && npx tsc` and existing listing tests pass

## Validation
- Migration applies on deploy (`migrate deploy` in Vercel build log)
- Existing listings unchanged (smoke: `GET /listings` still returns LIVE items)

## PR title
`feat(step3): add UNDER_OFFER and SOLD listing statuses`

## Done when
- Checklist `[x]` for database item only
```

---

## W2-A — Listing status frontend

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W2-A — Listing status frontend labels
- **BRANCH:** `cursor/step3-listing-status-fe-e4ea`
- **CHECKLIST:** Step 3 → **Listing status vocabulary — frontend label mapping**
- **BLOCKED until** W1-C merged to `main`

## Note
`src/lib/listing-status.ts` **already exists** — extend it; do not duplicate. Add `UNDER_OFFER` / `SOLD` labels and badge classes per checklist. Audit usages in:
- `src/components/ListingCard.tsx`
- `src/routes/dashboard.seller.index.tsx` (checklist says seller.tsx — find actual seller listing routes)
- `src/routes/dashboard.admin.listings.tsx`
- `src/routes/dashboard.buyer.listings.tsx`

## Tests
- Vitest for `statusLabel` / `statusBadgeClass` including new enums

## Validation
- Preview: seller dashboard shows "Pending Review" not raw enum
- Badge colors for UNDER_OFFER (blue per checklist)

## PR title
`feat(step3): listing status labels for UNDER_OFFER and SOLD`
```

---

## W2-B — Professional credential profile

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W2-B — Professional credential profile
- **BRANCH:** `cursor/step3-pro-credentials-e4ea`
- **CHECKLIST:** Step 3 → **Professional credential profile** (full stack)
- **SCHEMA OWNER:** Yes — do not run parallel with W2-D schema changes

## Implement
- `ProfessionalProfile` model + migration
- `backend/src/professionals/` (or match existing module layout) — me profile GET/PUT, staff PATCH verify
- FE: professional dashboard "My Credentials"
- FE: staff credential review queue

## Patterns
- Auth: `JwtPayload`, role guards like listings controller
- Hooks: follow `src/hooks/use-listings.ts`

## Validation
- Pro fills profile → staff approves → pro sees Verified
- L4 curl + L5 browser on preview

## PR title
`feat(step3): professional credential profile and staff verification`
```

---

## W2-C — Risk flag taxonomy UI

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W2-C — Risk flags
- **BRANCH:** `cursor/step3-risk-flags-ui-e4ea`
- **CHECKLIST:** Step 3 → **Risk flag taxonomy and picker UI**
- **NO schema** unless risk flags storage requires it (use existing `riskFlags` on verification step)

## Implement
1. `src/lib/risk-flags.ts` — `RISK_FLAGS` constant array per checklist
2. Professional task detail — multi-select checkboxes
3. Staff workflow — labelled badges for stored codes

## Do not edit
- `backend/prisma/schema.prisma`
- Professional profile files (W2-B)

## Validation
- Pro submits 2 flags → staff sees human labels
- Unit test for label lookup helper

## PR title
`feat(step3): risk flag taxonomy and picker UI`
```

---

## W2-D — Report revision loop

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W2-D — Report acceptance and revision
- **BRANCH:** `cursor/step3-report-revision-loop-e4ea`
- **CHECKLIST:** Step 3 → **Report acceptance and revision loop**
- **SCHEMA OWNER:** Yes — coordinate with W2-B (merge W2-B first, or combine verification enum migration)

## Implement
- Verification step statuses: `ACCEPTED`, `REVISION_REQUESTED`
- `revisionNote` on `VerificationStep`
- `PATCH .../accept`, `PATCH .../request-revision`
- Staff workflow buttons + pro resubmit UX
- Consider `AuditService.log()` for accept/revision (constants already exist)

## Validation
Full loop on preview: submit → revision with note → resubmit → accept → ACCEPTED

## PR title
`feat(step3): verification report accept and revision loop`
```

---

## W3-A — Service catalog backend

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W3-A — Service catalog API
- **BRANCH:** `cursor/step4-service-catalog-api-e4ea`
- **CHECKLIST:** Step 4 → **database and seed** AND **API endpoints** (one PR or two sequential PRs if too large)
- **REQUIRES:** Platform config merged (`getVatRate()` for calculate endpoint)

## Implement
- Models: `ServiceCatalogItem`, `ServiceBundle`, `BundleItem`
- Seed on module init (15 services, 3 bundles per checklist prices)
- Endpoints: GET items, GET bundles, POST calculate, PATCH item (ADMIN)

## Validation
- `curl` public bundles → 3 bundles with items
- POST calculate → correct 7.5% VAT from platform config

## PR title
`feat(step4): service catalog schema, seed, and API`
```

---

## W3-B — ServiceSelector component

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W3-B — ServiceSelector UI
- **BRANCH:** `cursor/step4-service-selector-fe-e4ea`
- **CHECKLIST:** Step 4 → **Service catalog — frontend selection UI**
- **BLOCKED until** W3-A API merged (or use PR preview API URL from W3-A)

## Implement
- `src/components/ServiceSelector.tsx` per checklist
- Live subtotal / VAT / total in ₦
- `onSelectionChange({ itemIds, bundleId?, total })`
- Temporary test route OK if no wizard yet

## Validation
- Select Elite bundle → 15 services, correct total with VAT
- Vitest for price formatting logic

## PR title
`feat(step4): ServiceSelector component with bundle and à la carte`
```

---

## After Step 2 gate — sequential critical path

Do **not** parallelize until Wave 1–3 stable:

**Step 5** → **6 (PoA)** → **7 (Escrow)** → **8 (Notifications)** → **9 (KYC)** → **10 (DD Wizard)**

**Step 11** (search, saved properties, inspections, analytics) can run **up to 4 parallel** while Step 10 is in progress, if each avoids wizard routes.

---

## Progress reference

| Milestone | Checklist items `[x]` | Approx % |
| --------- | --------------------- | -------- |
| Now | 8 / 51 | ~16% |
| After Wave 1 | 11 / 51 | ~22% |
| After Wave 2 | 15 / 51 | ~29% |
| After Wave 3 | 17 / 51 | ~33% |
