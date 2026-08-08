# Local development & validation (primary)

Day-to-day building and checklist validation use **local frontend + local backend** against the **shared cloud Postgres** (same database as the Vercel API). **Docker is not used.**

## URLs

| Surface | URL |
| -------- | ----- |
| **App (Vite)** | http://localhost:8080 |
| **API (NestJS)** | http://localhost:3001/api/v1 |
| **Health** | http://localhost:3001/api/v1/health |

## Paystack (real test mode)

Standalone due diligence and guest checkout call the **live Paystack API** with your test keys (`sk_test_…` / `pk_test_…`). Keep `PAYSTACK_FORCE_MOCK=false` (or unset).

- Checkout uses Paystack inline `accessCode` (same pattern as listed-property checkout).
- In Paystack’s TEST checkout UI, choose **Success** (or enter card `4084084084084081`, expiry any future date, CVV `408`, PIN `0000`, OTP `123456` as needed). Docs: https://paystack.com/docs/payments/test-payments/
- Very large test amounts can return “insufficient funds” on sandbox cards; use the Success test option or a smaller schedule for sandbox demos. Live keys are unaffected.

The Vite dev server proxies `/api/v1` → `http://localhost:3001` (`vite.config.ts`). Frontend code must use relative `/api/v1` paths so session cookies work.

```bash
export SBR_APP_URL="http://localhost:8080"
export SBR_API_BASE="http://localhost:3001/api/v1"
```

## One-time setup

### 1. Backend environment

Copy the example and set your cloud database URL (from Prisma Data Platform / team secret store — **never commit `backend/.env`**):

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL and DATABASE_POSTGRES_URL to the same postgres URL
```

Required keys in `backend/.env`:

- `DATABASE_URL` — cloud Postgres (`?sslmode=require`)
- `DATABASE_POSTGRES_URL` — same value as `DATABASE_URL`
- `SBR_CONFIRM_CLOUD_DATABASE_URL=true` — **required** when `DATABASE_URL` is not localhost (opts in to shared cloud Postgres)
- `JWT_SECRET` — min 32 characters
- `PORT=3001`
- `FRONTEND_URL=http://localhost:8080,http://localhost:5173` (+ production URLs if needed)

### 2. Install & Prisma client

```bash
npm install
cd backend && npm install
npx prisma generate
```

### 3. Apply migrations to cloud DB

```bash
cd backend
npx prisma migrate deploy
```

Optional (empty or dev-only DB): `SEED_NO_WIPE=1 npx prisma db seed`

**Never run `prisma migrate reset`** against the shared cloud database.

**Pass `SEED_NO_WIPE=1`.** Without it the seed's first act is `deleteMany()` on 24 tables — users,
payments, escrow, documents, everything — against whatever `DATABASE_URL` points at, and step 1 above
points it at the shared cloud Postgres. `backend/prisma/seed.ts:189` is the check; `docs/RUNBOOK.md`
§4.1 is the longer version.

## Running the stack

**Terminal 1 — API**

```bash
cd backend
npm run start:dev
```

**Terminal 2 — Frontend**

```bash
npm run dev
```

Vite binds to `127.0.0.1` by default. For Cloud/port-forwarded VMs, set `VITE_DEV_HOST=0.0.0.0` before `npm run dev`.

Open http://localhost:8080 and log in with seed users (`password123`):

| Role | Email |
|------|-------|
| ADMIN | admin@safebuyrealties.test |
| STAFF | staff@safebuyrealties.test |
| SELLER | seller@safebuyrealties.test |
| BUYER | buyer@safebuyrealties.test |
| PRO | lawyer@safebuyrealties.test |

## Validation gates (checklist / agents)

| Gate | When | What to run |
| ---- | ---- | ----------- |
| **A — Local** | Every item | `npm run validate:tsc`, `npm test`, `cd backend && npm test` |
| **B — CI** | Every push | GitHub Actions |
| **C — Local E2E** | Before marking `[x]` on API/UI items | Local stack running → curl + browser on `SBR_APP_URL` |
| **D — Deploy (optional)** | After merge | Vercel production smoke if deployment protection allows |

**Mark browser/API checklist items `[x]` after Gate C on localhost**, not only after Vercel preview.

## Coverage: the floor and the bar

Two different checks, and it is worth knowing which one is shouting at you.

The **floor** is per suite and stops coverage falling. It lives in `backend/jest.config.js` and
`vitest.config.ts`, and it fails the whole run when the repository average drops under it.

The **bar** is per pull request and stops the gap growing. It measures only the lines your branch
changed, and holds them to 80 percent. Run it after the suite that measures those files:

```bash
npm run test:cov && npm run validate:diff-coverage -- --scope frontend
cd backend && npm run test:cov && cd .. && npm run validate:diff-coverage -- --scope backend
```

It prints every changed file with its uncovered line numbers, so the answer is which test to write
rather than which check to disable. In CI it runs inside `frontend-test` and `backend-check` against
the pull request's base commit. If a diff genuinely cannot be covered by the suite that measures it,
put `diff-coverage-exception: <reason>` in the pull request description, the same way the board has
`no-board-update:`. The reason is the price, and a reviewer reads it.

### Raising a floor

```bash
npm run coverage:ratchet
```

It reads both configs and both coverage summaries and prints what each floor has earned: the
measured percentage floored to a whole percent, less two points, and never below what is already
written down. Ratchets only turn one way. Making the edit is still a person's job, in a pull request
with those figures in the body, because a floor that moves on its own is a floor nobody reads.

## API smoke (curl)

```bash
export SBR_API_BASE="http://localhost:3001/api/v1"
npm run smoke:api
```

Or manual login:

```bash
API="http://localhost:3001/api/v1"
JAR="$(mktemp)"
curl -sS "$API/health"
curl -sS -c "$JAR" -b "$JAR" -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"staff@safebuyrealties.test","password":"password123"}'
curl -sS -c "$JAR" -b "$JAR" "$API/auth/me"
curl -sS -c "$JAR" -b "$JAR" "$API/platform-config"
```

Document curls used in the PR or checklist item.

## Browser / L5 E2E

1. Start backend + frontend (above).
2. Walk `docs/demo-script-checklist.md` using **http://localhost:8080** as the base URL.
3. Record steps and outcomes in the PR (no Vercel preview required).

## End-to-end journeys

Five journeys, run by one command. They are the same five CI runs on every pull request, so a green
run here is the same evidence a green run there is.

```bash
npm run test:e2e-ci            # all five
npm run test:e2e-ci -- --list  # the ids, and which script proves which
npm run test:e2e-ci -- --kind api      # the four that only need the API
npm run test:e2e-ci -- --kind browser  # the one that drives a real browser
npm run test:e2e-ci -- --only guest-checkout
```

| Journey | Needs | Script |
| ------- | ----- | ------ |
| Buyer on-platform purchase | API | `scripts/journey-e2e-all-roles.mjs` |
| Seller listing to live | API | `scripts/listing-lifecycle-e2e.mjs` |
| Staff verification | API | same run as the seller journey |
| Standalone due diligence | API and app | `scripts/dd-checklist-e2e.mjs` |
| Guest checkout | API | `scripts/guest-checkout-e2e.mjs` |

The staff journey shares a process with the seller journey because they are one flow. Splitting
them would leave the staff half with no listing to verify.

`SBR_API_BASE` and `SBR_APP_URL` point the run somewhere other than `http://localhost:3001/api/v1`
and `http://localhost:8080`. Console output is also written per journey under `artifacts/e2e/`,
which is gitignored, along with any screenshot a failing browser journey takes.

`SBR_E2E_STRICT=1` counts a partial result as a failure. CI sets it, because CI runs against a
database it seeded a minute earlier, so "no LIVE listing to buy" is a regression there rather than
somebody else's Tuesday. Leave it off against the shared database.

The browser journey needs `npx playwright install chromium` once, and it needs `npm run dev`
rather than `npm run preview`: the `/api/v1` proxy is declared under `server` in `vite.config.ts`,
which preview does not read, and `src/lib/api.ts` deliberately ignores an absolute `VITE_API_URL`
because session cookies have to be same-origin.

### What CI does differently

CI does not use the shared cloud database for any of this. `.github/workflows/ci.yml` starts a
Postgres service container, and `.github/actions/ephemeral-api` migrates it with `migrate deploy`,
seeds it, adds the demo accounts, then builds and starts the API against it. The database lives and
dies with the job. Payments run in mock mode by an explicit `PAYSTACK_FORCE_MOCK=true`, never
against a Paystack key of any kind.

Two jobs rather than one, `e2e-api` and `e2e-browser`, so the browser journey's setup runs beside
the API journeys instead of after them. Both carry `timeout-minutes: 10`.

## Schema changes (shared cloud DB)

1. Edit `backend/prisma/schema.prisma`
2. Create migration:
   ```bash
   cd backend
   npx prisma migrate dev --name your-feature --create-only
   ```
3. Review SQL, then apply:
   ```bash
   npx prisma migrate deploy
   ```
4. Commit migration folder; Vercel deploy will also run `migrate deploy` on push.

Coordinate with teammates — one schema PR at a time on the shared database.

## Uploads / storage locally

`STORAGE_DRIVER=local` writes to `backend/uploads` (or `STORAGE_LOCAL_PATH`). Seller document upload E2E works against local API + cloud DB.

**The local driver is for development only, and production refuses to start on it.** It writes to
the machine's own disk, which no deployment promises to keep, so a document uploaded through it can
be gone by the next deploy with nothing in the logs to say so. `assertStorageConfigured()` in
`backend/src/config/storage-guard.ts` stops the boot wherever `isProductionEnvironment()` is true
and the driver is `local`, and that includes the case where nothing declares the environment at all,
because an undeclared environment is treated as production on purpose (ADR-0006). Development, test
and staging are unaffected, and a Vercel preview resolves to staging, so previews keep uploading
locally as they always have.

On a host whose filesystem is thrown away with the process, the local driver writes to
`/tmp/safebuyrealties-uploads` rather than into the deployment bundle. Set `STORAGE_EPHEMERAL_FS=true`
to declare that outright; left unset the code guesses from the platform, which today means Vercel.

To run against S3 locally, set `STORAGE_DRIVER=s3` with `AWS_REGION`, `AWS_S3_BUCKET` and either a
key pair or ambient credentials. Every write is encrypted server side, `AES256` by default, and
`AWS_S3_SSE=aws:kms` with `AWS_S3_SSE_KMS_KEY_ID` selects a managed key instead. A driver failure
comes back as a 502 carrying the request's correlation id, never as a 500, and the response says
nothing about the bucket. Bucket policy, object versioning and the migration of existing objects are
not settled here: they wait on the bucket itself, which is EXT-2.

## Feature flags locally

Every roadmap flag is off by default, so a feature built behind one is invisible until you say
otherwise. Turn one on for a local session by setting its variable in `backend/.env` and restarting
the API:

```bash
FEATURE_PAYOUTS=on npm run start:dev
```

The names are `FEATURE_<KEY>` with the key upper-cased, and the keys are listed in
`backend/src/feature-flags/feature-flags.constants.ts`. Accepted values are `on/true/1/yes/enabled`
and `off/false/0/no/disabled`; anything else is ignored and warned about at boot.

`curl -s localhost:3001/api/v1/feature-flags | jq` shows what the running process believes. Signed
in as an operator it also shows where each value came from, which is the quick way to find out that
the variable you set is not the one being read.

The browser reads the same endpoint, so a flag flipped on the API reaches the page within a minute
without a rebuild. `VITE_FEATURE_<KEY>` in `.env.local` only sets what the page believes before that
response arrives. `docs/RUNBOOK.md` §11 is the operator version of all this.

## Optional: Vercel deploy check

See `docs/VERCEL_VALIDATION.md` for production URLs, **`API_PROXY_TARGET`** on the Vercel frontend project, and deploy-only troubleshooting. Skip Vercel preview when deployment protection blocks curl/browser automation.

## Troubleshooting

| Problem | Fix |
| ------- | ----- |
| `Can't reach database` | Check `DATABASE_URL` in `backend/.env`, SSL `sslmode=require`, IP allowlist on Prisma/host |
| 401 after login in browser | Use `/api/v1` relative paths; backend `FRONTEND_URL` includes `http://localhost:8080` |
| CORS | Add `http://localhost:8080` to `FRONTEND_URL` in `backend/.env` |
| Prisma client errors | `cd backend && npx prisma generate` |
| Port in use | FE 8080, BE 3001 — kill stale processes |
