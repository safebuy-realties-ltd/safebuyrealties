# Vercel-first validation (no Docker required)

SafeBuyRealties runs on Vercel for **frontend**, **backend API**, and **Postgres** (Vercel Storage / Prisma Postgres). You do not need local Docker for day-to-day validation.

## Deployed URLs

| Surface | Production URL | Notes |
| -------- | ---------------- | ----- |
| **Buyer/seller app** | https://safebuyrealties-app.vercel.app | TanStack app; API via same-origin `/api/v1` rewrite |
| **API (direct)** | https://safebuyrealties.vercel.app/api/v1 | NestJS; use for curl when testing API only |
| **Health** | https://safebuyrealties.vercel.app/api/v1/health | Quick deploy smoke check |

**Preview deployments:** Each git push can produce preview URLs (`*.vercel.app`). Prefer validating on the **latest preview** for the branch you are building, then production after merge.

Set these in your shell (or `.env.local` for scripts):

```bash
export SBR_APP_URL="https://safebuyrealties-app.vercel.app"
export SBR_API_BASE="https://safebuyrealties.vercel.app/api/v1"
# Or, when testing through the app origin (rewrites to API):
export SBR_API_BASE="https://safebuyrealties-app.vercel.app/api/v1"
```

Use **one** API base consistently per test. Cookie auth must use the same host you logged in on (prefer `SBR_APP_URL` + `/api/v1` for browser and curl).

## Validation gates (replaces local Docker workflow)

| Gate | When | What to run |
| ---- | ---- | ----------- |
| **A — Local** | Every checklist item | `npx tsc --noEmit` (root), `cd backend && npx tsc --noEmit` |
| **B — CI** | Every push | GitHub Actions (`.github/workflows/ci.yml`) |
| **C — Vercel preview** | After pushing a branch with BE/FE or schema changes | Wait for Vercel deploy → health curl → browser walkthrough on preview URL |
| **D — Production** | Milestones (Steps 2, 5, 7, 10) | Same as C on production URLs + `docs/demo-script-checklist.md` |

**Do not block on Docker.** If Gate A passes and preview deploy is green, you can mark API/UI items done after Gate C on that preview.

## Database & migrations (remote Postgres)

Schema changes ship through Vercel’s backend build (`vercel-build` runs `prisma migrate deploy`).

### Option 1 — Recommended: migrate on deploy only

1. Edit `backend/prisma/schema.prisma`
2. Create migration without applying locally:
   ```bash
   cd backend
   npx prisma migrate dev --name your-feature --create-only
   ```
3. Commit the new folder under `prisma/migrations/`
4. Push → Vercel backend build runs `migrate deploy` against production/preview DB

Validate the migration succeeded in the **Vercel deployment build logs** for the backend project.

### Option 2 — Apply locally against Vercel Postgres (no Docker)

1. Link backend project: `cd backend && vercel link`
2. Pull env: `vercel env pull .env.local`
3. Run: `npx prisma migrate dev --name your-feature` (uses `DATABASE_URL` from Vercel)

Never run `prisma migrate reset`.

Demo users are seeded on empty DB during deploy (`vercel-seed-if-empty.mjs`). Test logins:

- `staff@safebuyrealties.test` / `password123`
- `lawyer@safebuyrealties.test` / `password123`
- `seller@safebuyrealties.test` / `password123`
- `buyer@safebuyrealties.test` / `password123`

## API smoke (curl)

Save cookies from login, then call protected routes.

```bash
API="${SBR_API_BASE:-https://safebuyrealties-app.vercel.app/api/v1}"
JAR="$(mktemp)"

# Health (no auth)
curl -sS "$API/health"

# Login
curl -sS -c "$JAR" -b "$JAR" -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"staff@safebuyrealties.test","password":"password123"}'

# Session
curl -sS -c "$JAR" -b "$JAR" "$API/auth/me"
```

Document the exact curl you used in the checklist item or at the top of the service file when adding endpoints.

Or run the repo helper (after deploy):

```bash
SBR_API_BASE="$SBR_API_BASE" node scripts/vercel-api-smoke.mjs
```

## Browser / E2E (Gate C)

1. Push your branch and open the **frontend** preview URL from the Vercel dashboard (or production `SBR_APP_URL`).
2. Log in with seed users above.
3. Walk routes in `docs/demo-script-checklist.md`.
4. In Cursor, the browser MCP can target the deployed URL directly — no local `npm run dev` required.

Checklist for staff/pro/buyer dashboards:

- `/dashboard/professional` — KPI counts not all zero when tasks exist
- `/dashboard/professional/tasks`
- `/dashboard/staff/workflow`
- `/dashboard/staff/submissions` — approve updates status

## When to use local `npm run dev` (optional)

Use local dev only when you need fast HMR while editing UI:

```bash
# Root .env.local
VITE_API_URL=/api/v1
```

```bash
# Terminal 1 — proxy to production API (no local backend)
npm run dev
```

Vite proxies `/api/v1` to production API per `vite.config.ts` target, **or** point `VITE_API_URL` at `https://safebuyrealties-app.vercel.app/api/v1` if you change the proxy.

For a **local backend** without Docker, set `DATABASE_URL` from `vercel env pull` in `backend/.env` and run `npm run start:dev` in `backend/`.

## Checklist authors

Replace `http://localhost:3001/api/v1` in validation bullets with:

`$SBR_API_BASE` (default: `https://safebuyrealties-app.vercel.app/api/v1`)

Mark browser-dependent items done after **preview or production** verification, not only `tsc`.

## Troubleshooting

| Problem | Likely fix |
| ------- | ---------- |
| 401 on API after login | Curl/browser must use same host for login and follow-up requests; use cookie jar `-c`/`-b` |
| CORS errors on preview | Add preview frontend URL to `FRONTEND_URL` in backend Vercel env (comma-separated) |
| Migration didn’t apply | Check backend deployment build log for `[vercel-migrate]` |
| Empty DB / no login | Trigger redeploy or run seed path once; confirm `DATABASE_URL` on backend project |
| FE works, API 502 | Validate backend project deploy separately at `safebuyrealties.vercel.app/api/v1/health` |
