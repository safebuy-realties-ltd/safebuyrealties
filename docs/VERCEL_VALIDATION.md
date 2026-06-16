# Vercel / deploy validation (optional)

**Primary workflow:** local stack + cloud Postgres — see **`docs/LOCAL_DEVELOPMENT.md`**.

Use this doc for production/preview URLs, deploy migrations, and post-merge smoke when Vercel is reachable. **Checklist items should not depend on Vercel preview** if deployment protection blocks access.

## Deployed URLs

| Surface | Production URL | Notes |
| -------- | ---------------- | ----- |
| **Buyer/seller app** | https://safebuyrealties-app.vercel.app | TanStack app; browser calls same-origin `/api/v1` |
| **API (via Vercel rewrite)** | https://safebuyrealties-app.vercel.app/api/v1 | Proxied to Render — see `API_PROXY_TARGET` below |
| **API (direct Render)** | Set in `API_PROXY_TARGET` | e.g. `https://safebuyrealties-yc0i.onrender.com/api/v1` |
| **Health (through app)** | https://safebuyrealties-app.vercel.app/api/v1/health | Confirms rewrite + backend |

```bash
export SBR_APP_URL="https://safebuyrealties-app.vercel.app"
export SBR_API_BASE="https://safebuyrealties-app.vercel.app/api/v1"
```

## Vercel environment variables (frontend project)

The Render backend URL is **not** stored in git. Configure it in **Vercel → Project → Settings → Environment Variables**:

| Variable | Required | Example | Purpose |
| -------- | -------- | ------- | ------- |
| `API_PROXY_TARGET` | **Yes** (Production + Preview) | `https://safebuyrealties-yc0i.onrender.com` | Vercel rewrite destination for `/api/v1` and `/uploads` (`vercel.mjs`) |
| `VITE_API_URL` | Optional | `/api/v1` | Browser API base (default is `/api/v1`; keep relative for cookie auth) |

**Do not** set `VITE_API_URL` to the Render hostname in production — session cookies require same-origin requests. The browser talks to `/api/v1` on the Vercel app; Vercel proxies to Render using `API_PROXY_TARGET`.

After adding or changing `API_PROXY_TARGET`, **redeploy** the frontend project.

## When to use Vercel validation

- After merge: confirm frontend redeploy and `curl` health through the app URL
- Optional production regression: `SBR_API_BASE=https://safebuyrealties-app.vercel.app/api/v1 npm run smoke:api`
- Paystack / serverless-only env vars

## Migrations on deploy

Backend on Render applies migrations via its own deploy/build. Local developers apply the same migrations to the **shared cloud DB** with:

```bash
cd backend && npx prisma migrate deploy
```

## Deployment protection

Preview URLs may return 401 without bypass token / Vercel auth. **Do not block checklist completion** — use local Gate C instead (`LOCAL_DEVELOPMENT.md`).

## Troubleshooting (deploy-only)

| Problem | Likely fix |
| ------- | ---------- |
| `/api/v1/health` returns 503 or HTML error page | Set `API_PROXY_TARGET` on Vercel and redeploy; confirm Render service is running |
| Build fails: `API_PROXY_TARGET is required` | Add env var for the environment being deployed (Production/Preview) |
| Login works locally but not on Vercel | Ensure `FRONTEND_URL` on **Render** includes `https://safebuyrealties-app.vercel.app` |
| CORS on preview | Add preview URL to `FRONTEND_URL` on Render |
| Empty DB on new env | Run `cd backend && npm run prisma:seed` against the new database |
| Paystack mock | Unset invalid `PAYSTACK_SECRET_KEY` or use test key |
