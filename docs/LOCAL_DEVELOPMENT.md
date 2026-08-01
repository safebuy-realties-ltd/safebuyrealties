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
