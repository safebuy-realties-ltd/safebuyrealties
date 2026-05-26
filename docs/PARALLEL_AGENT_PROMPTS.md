# Parallel agent prompt pack

**Baseline as of 2026-05-26** — Step 2 complete on `main` (spec schema, storage, audit, platform config, property spec FE). See `docs/BUILD_CHECKLIST.md`.

**Validation:** Local stack only — [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) (`http://localhost:8080`, `http://localhost:3001/api/v1`). No Docker. Vercel preview not required for `[x]`.

**Coordinator:** Max 3–4 parallel agents; one Prisma schema owner per wave.

---

## Coordinator checklist (run once per wave)

- [ ] `git pull origin main` on all agents
- [ ] Assign non-overlapping branches (`cursor/<topic>-e4ea`)
- [ ] Schema PR merges first; others rebase before push
- [ ] After wave merge: `npm run validate:tsc`, `npm test`, `cd backend && npm test`, `npm run smoke:api` (local API)
- [ ] Gate C: `docs/demo-script-checklist.md` on **http://localhost:8080** with local BE running
- [ ] Update `docs/BUILD_CHECKLIST.md` Last Session Notes + `[x]` only for items you validated

**Gotchas** (`docs/VALIDATION_REPORT.md` — historical): staff queue `pageSize` ≤ 100; seed listings mostly `LIVE`; unset invalid `PAYSTACK_SECRET_KEY` for mock payments.

**API base (local):** `http://localhost:3001/api/v1`  
**Seed password:** `password123` — `admin@`, `staff@`, `seller@`, `buyer@`, `lawyer@` `@safebuyrealties.test`

---

## Wave 1 — Step 3 kickoff (up to 3 parallel)

| Track | Branch | Checklist item | Schema? |
| ----- | ------ | -------------- | ------- |
| **W1-A** | `cursor/step3-listing-status-db-e4ea` | Listing status — database | **Yes — merge first** |
| **W1-B** | `cursor/step3-listing-status-fe-e4ea` | Listing status — frontend | After W1-A; extend `src/lib/listing-status.ts` |
| **W1-C** | `cursor/step3-risk-flags-ui-e4ea` | Risk flag taxonomy + UI | No |

---

## Wave 2 — Step 3 continued

| Track | Branch | Checklist item |
| ----- | ------ | -------------- |
| **W2-A** | `cursor/step3-pro-credentials-e4ea` | Professional credential profile |
| **W2-B** | `cursor/step3-report-revision-loop-e4ea` | Report accept / revision loop |

Serialize schema between W2-A and W2-B if both touch verification enums.

---

## Wave 3 — Step 4

| Track | Branch | Checklist item |
| ----- | ------ | -------------- |
| **W3-A** | `cursor/step4-service-catalog-api-e4ea` | Service catalog — DB, seed, API |
| **W3-B** | `cursor/step4-service-selector-fe-e4ea` | ServiceSelector UI (after W3-A API) |

---

## Shared preamble (paste at top of every agent prompt)

```markdown
You are a senior full-stack engineer on **SafeBuyRealties**.

## Read first
1. AGENTS.md
2. docs/AGENT_PROMPT.md
3. docs/LOCAL_DEVELOPMENT.md
4. docs/BUILD_CHECKLIST.md — your assigned item only

## Already done (Step 2) — do not rebuild
Listing spec schema, object storage, audit logging, platform config, property spec FE.

## Validation (required before [x])
- Local API: http://localhost:3001/api/v1 (npm run smoke:api)
- Local UI: http://localhost:8080
- npm run validate:tsc; npm test; cd backend && npm test
- No Docker; no Vercel preview required
- backend/.env has cloud DATABASE_URL — never commit .env

## Git
- Branch: cursor/<topic>-e4ea from main
- One checklist item per PR; CI green before merge
```

---

## W1-A — Listing status enum (database)

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W1-A — Listing status vocabulary database
- **BRANCH:** `cursor/step3-listing-status-db-e4ea`
- **CHECKLIST:** Step 3 → **Listing status vocabulary — database** only
- **SCHEMA OWNER:** Yes

## Do not edit
- `src/lib/listing-status.ts` (W1-B)
- Other Step 3 features

## Implement
1. Add `UNDER_OFFER`, `SOLD` to `ListingStatus` enum
2. Migration only — no data backfill required
3. `npx prisma migrate deploy` against cloud DB in backend/.env

## Validation
- `npm run validate:tsc`, `cd backend && npm test`
- `npm run smoke:api` — listings still return after migrate

## PR title
`feat(step3): add UNDER_OFFER and SOLD listing statuses`
```

---

## W1-B — Listing status frontend

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W1-B — Listing status frontend labels
- **BRANCH:** `cursor/step3-listing-status-fe-e4ea`
- **CHECKLIST:** Step 3 → **Listing status vocabulary — frontend label mapping**
- **BLOCKED until** W1-A merged to `main`

## Note
`src/lib/listing-status.ts` **already exists** — extend with `UNDER_OFFER` / `SOLD`. Audit:
- `src/components/ListingCard.tsx`
- `src/routes/dashboard.seller.index.tsx`
- `src/routes/dashboard.admin.listings.tsx`
- `src/routes/dashboard.buyer.listings.tsx`

## Validation (L5 on localhost:8080)
- Seller dashboard shows "Pending Review" not raw enum
- UNDER_OFFER badge uses blue styling per checklist

## PR title
`feat(step3): listing status labels for UNDER_OFFER and SOLD`
```

---

## W1-C — Risk flag taxonomy UI

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W1-C — Risk flags
- **BRANCH:** `cursor/step3-risk-flags-ui-e4ea`
- **CHECKLIST:** Step 3 → **Risk flag taxonomy and picker UI**
- **NO schema**

## Implement
1. `src/lib/risk-flags.ts` — `RISK_FLAGS` per checklist
2. Professional task detail — multi-select checkboxes
3. Staff workflow — labelled badges

## Validation
- Local E2E: pro submits 2 flags → staff sees human labels

## PR title
`feat(step3): risk flag taxonomy and picker UI`
```

---

## W2-A — Professional credential profile

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W2-A — Professional credential profile
- **BRANCH:** `cursor/step3-pro-credentials-e4ea`
- **CHECKLIST:** Step 3 → **Professional credential profile** (full stack)
- **SCHEMA OWNER:** Yes — do not parallel schema with W2-B

## Validation
- Local E2E: pro fills profile → staff approves → pro sees Verified

## PR title
`feat(step3): professional credential profile and staff verification`
```

---

## W2-B — Report revision loop

```markdown
[PASTE SHARED PREAMBLE]

## Assignment
- **TRACK:** W2-B — Report acceptance and revision
- **BRANCH:** `cursor/step3-report-revision-loop-e4ea`
- **CHECKLIST:** Step 3 → **Report acceptance and revision loop**
- **SCHEMA OWNER:** Yes — merge W2-A first or combine verification enum migration

## Validation
- Local E2E: submit → revision with note → resubmit → accept → ACCEPTED

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
- **CHECKLIST:** Step 4 → database/seed + API endpoints
- **REQUIRES:** `PlatformConfigService.getVatRate()` on main

## Validation
- `curl http://localhost:3001/api/v1/service-catalog/bundles`
- POST calculate → 7.5% VAT from platform config

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
- **BLOCKED until** W3-A API available on local backend

## Validation
- localhost:8080 — Elite bundle → 15 services, correct VAT total

## PR title
`feat(step4): ServiceSelector component with bundle and à la carte`
```

---

## After Step 3 — sequential critical path

Do **not** parallelize: **Step 5** → **6 (PoA)** → **7 (Escrow)** → **8** → **9 (KYC)** → **10 (DD Wizard)**

**Step 11** can run up to 4 parallel tracks while Step 10 is in progress.

---

## Progress reference

| Milestone | Checklist items `[x]` | Approx % |
| --------- | --------------------- | -------- |
| Now (Step 2 done) | 10 / 51 | ~20% |
| After Step 3 | 15 / 51 | ~29% |
| After Step 4 | 17 / 51 | ~33% |
