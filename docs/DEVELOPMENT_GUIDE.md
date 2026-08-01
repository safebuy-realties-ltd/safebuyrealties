# SafeBuyRealties — Development Guide

Single reference for how we build, test, validate, and ship. **Agents and humans follow this.**

## Document map

| Doc | Purpose |
| --- | --- |
| **This file** | TDD, PR/CI, full-stack validation, step rhythm |
| `docs/AGENT_PROMPT.md` | Paste into new AI sessions (short loop) |
| `docs/BUILD_CHECKLIST.md` | Ordered work queue (`[ ]` / `[~]` / `[x]`) |
| `docs/GIT_WORKFLOW.md` | Branch → PR → merge (never push `main` directly) |
| `docs/LOCAL_DEVELOPMENT.md` | **Primary** — local FE/BE, cloud Postgres, curl, L5 E2E |
| `docs/VERCEL_VALIDATION.md` | Optional deploy / production smoke |
| `docs/RUNBOOK.md` | Deploy, rollback, incident triage, environment matrix, secrets |
| `docs/demo-script-checklist.md` | Manual browser journeys (Gate C on localhost:8080) |
| `docs/VALIDATION_REPORT.md` | Last production validation snapshot |

---

## Golden rules

1. **Checklist is the queue** — one item at a time unless explicitly parallelized.
2. **Branch + PR always** — see `docs/GIT_WORKFLOW.md`. Merge only when **CI is green**.
3. **Test-driven** — failing test first → minimal implementation → green → refactor.
4. **Full-stack for features** — backend + frontend + deployed check when both sides change.
5. **No `main` pushes** — feature branches only.

---

## Validation layers (frontend + backend together)

Every checklist item uses the layers that apply:

| Layer | What | When | Command / action |
| ----- | ---- | ---- | ---------------- |
| **L1 — Unit** | Pure logic, hooks, services (mocked deps) | Every behavior change | `npm test` (FE), `cd backend && npm test` (BE, once Jest is wired) |
| **L2 — Type** | TypeScript contracts | Every commit | `npm run validate:tsc` |
| **L3 — Lint** | ESLint (frontend) | Every FE PR | `npx eslint src --max-warnings 0` |
| **L4 — API** | HTTP contract vs **local** API | New/changed endpoints | `npm run smoke:api`, item-specific curl to `localhost:3001` |
| **L5 — UI** | Route loads, role flow, no console errors | New/changed routes | **http://localhost:8080** + `docs/demo-script-checklist.md` |
| **L6 — Gate C** | Milestone demo on local stack | End of Steps 2, 5, 7, 10 | Full role walkthroughs (`docs/LOCAL_DEVELOPMENT.md`) |

**Mark a checklist item `[x]` only when its listed validation passes** (checklist text + applicable layers above).

**“End-to-end”** for a feature means: **L1 + L2 + L4 + L5** minimum (API and UI both exercised on the **local** stack).

---

## Test-driven development (TDD)

### Order of work per checklist item

1. Read the checklist item and existing patterns.
2. **Write/update tests** that describe the expected behavior (they should fail).
3. Implement backend and/or frontend until tests pass.
4. Run **L2–L5** as applicable.
5. Commit on feature branch → push → **open PR** → wait for **CI green** → merge.

### What to test

| Area | Tool | Location | Examples |
| ---- | ---- | -------- | -------- |
| React hooks / utils | Vitest | `src/**/*.test.ts(x)` | `use-listings` mapping, status labels |
| React components | Vitest + Testing Library | `src/**/*.test.tsx` | Form validation, conditional buttons |
| NestJS services | Jest | `backend/src/**/*.spec.ts` | `ListingsService` status transitions, `StorageService` |
| HTTP controllers | Jest + supertest (optional) | `backend/test/` or `*.e2e-spec.ts` | `GET /platform-config` auth |
| Cross-service flows | `scripts/validate-e2e-claims.mjs` | Extend script per milestone | Login, listing CRUD, payment |

**Policy:** New service methods, hooks, and non-trivial UI behavior **require** a test in the same PR. Bug fixes **require** a regression test.

### CI must run tests

On every PR to `main`, `.github/workflows/ci.yml` runs:

- **Frontend** (when `src/**` etc. change): `tsc`, ESLint, **`npm test`**
- **Backend** (when `backend/**` changes): `tsc`, **`npm test`**
- **`CI (required)`** — aggregate gate; must be green before merge

Branch protection should require **`CI (required)`** on `main` (see `docs/BRANCH_PROTECTION.md`). Do not merge PRs that drop checks or skip tests for new behavior.

---

## Git & PR workflow (required)

```bash
git checkout main && git pull origin main
git checkout -b feat/step2-listing-spec-media   # name matches work

# TDD loop …
npm run validate:tsc
npm test   # when tests exist for your change

git push -u origin feat/step2-listing-spec-media
gh pr create --base main --title "feat: …" --body "## Summary … ## Test plan …"
```

**PR body must include:**

- Checklist item ID(s) addressed
- Tests added (file paths)
- Validation run: `validate:tsc`, `test`, `smoke:api`, preview URL if UI

**Merge checklist:**

- [ ] CI green on GitHub
- [ ] Local backend + frontend running (`docs/LOCAL_DEVELOPMENT.md`)
- [ ] You ran applicable L4/L5 on localhost
- [ ] No secrets in diff

---

## Step-by-step roadmap (after Step 1 ✅)

Work **one checklist item per PR** (or one small group if tightly coupled, e.g. schema + migration only).

| Step | Theme | Suggested PR series | Gate C? |
| ---- | ----- | ------------------- | ------- |
| **2** | Foundation (specs, storage, audit, config, FE specs) | 2a schema+migration, 2b storage, 2c audit, 2d platform-config, 2e FE specs | Yes — seller specs visible |
| **3** | Verification pipeline | status labels, credentials, risk flags, revision loop | Staff/pro demo |
| **4** | Service catalog | DB seed, API, `ServiceSelector` | — |
| **5** | Payments (two intents) | schema, service, FE labels | Payment smoke |
| **6** | PoA | model, PDF API, execution screen | — |
| **7** | Escrow | model, release/refund, FE status | Money loop |
| **8** | Notifications | model, triggers, bell UI | — |
| **9** | KYC | model, staff queue, profile UI | — |
| **10** | DD wizard (7 steps) | route, steps 1–7 (can split) | **Yes — primary buyer journey** |
| **11** | Polish | search, saved, inspections, analytics | — |

Between steps: update `docs/VALIDATION_REPORT.md` and **Last Session Notes** in `BUILD_CHECKLIST.md`.

---

## Per-session agent loop (short)

1. `docs/AGENT_PROMPT.md` + this guide + first `[ ]` in `BUILD_CHECKLIST.md`
2. Branch from `main`
3. TDD → implement → validate (layers above)
4. PR → CI green → merge
5. Update checklist + Last Session Notes

---

## Environment

- **Local secrets:** `backend/.env` (Paystack: `PAYSTACK_TEST_SECRET_KEY`; code also reads `PAYSTACK_SECRET_KEY`)
- **Vercel API:** `npm run env:sync-paystack` → project `safebuyrealties`
- **Migrations:** `--create-only` locally → commit SQL → deploy applies `migrate deploy`
- Details: `docs/VERCEL_VALIDATION.md`

---

## Known gaps (track and close)

| Gap | Action |
| --- | ------ |
| Backend has no Jest yet | First Step 2 PR can add `jest` + one `listings.service.spec.ts` template |
| CI does not run `npm test` | Add job in `.github/workflows/ci.yml` |
| `validate:e2e` not in CI | Run manually before merge; optional nightly workflow later |
| Paystack test emails | Use Paystack-approved test emails or mock mode (empty production secret) |
| Pipeline seed on prod | Ensure API redeploy after merge so `vercel-ensure-pipeline-listings` runs |
