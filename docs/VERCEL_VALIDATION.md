# Vercel / deploy validation (optional)

**Primary workflow:** local stack + cloud Postgres — see **`docs/LOCAL_DEVELOPMENT.md`**.

Use this doc for production/preview URLs, deploy migrations, and post-merge smoke when Vercel is reachable. **Checklist items should not depend on Vercel preview** if deployment protection blocks access.

## Deployed URLs

| Surface | Production URL | Notes |
| -------- | ---------------- | ----- |
| **Buyer/seller app** | https://safebuyrealties-app.vercel.app | TanStack app; API via same-origin `/api/v1` rewrite |
| **API (direct)** | https://safebuyrealties.vercel.app/api/v1 | NestJS |
| **Health** | https://safebuyrealties.vercel.app/api/v1/health | Deploy smoke |

```bash
export SBR_APP_URL="https://safebuyrealties-app.vercel.app"
export SBR_API_BASE="https://safebuyrealties.vercel.app/api/v1"
```

## When to use Vercel validation

- After merge: confirm backend build applied migrations (`[vercel-migrate]` in logs)
- Optional production regression: `SBR_API_BASE=https://safebuyrealties.vercel.app/api/v1 npm run smoke:api`
- Paystack / serverless-only env vars

## Migrations on deploy

`backend` Vercel build runs `prisma migrate deploy` via `vercel-build`. Local developers apply the same migrations to the **shared cloud DB** with:

```bash
cd backend && npx prisma migrate deploy
```

## Deployment protection

Preview URLs may return 401 without bypass token / Vercel auth. **Do not block checklist completion** — use local Gate C instead (`LOCAL_DEVELOPMENT.md`).

## Troubleshooting (deploy-only)

| Problem | Likely fix |
| ------- | ---------- |
| Migration didn’t apply on deploy | Backend deployment build log |
| CORS on preview | Add preview URL to `FRONTEND_URL` in Vercel env |
| Empty DB on new env | `vercel-seed-if-empty.mjs` on deploy |
| Paystack mock | Unset invalid `PAYSTACK_SECRET_KEY` or use test key |
