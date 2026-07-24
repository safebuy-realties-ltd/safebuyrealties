# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview

SafeBuyRealties is a real estate transaction platform with:
- **Frontend**: TanStack Start (React 19) + Vite + Tailwind CSS v4 + shadcn/ui at port **8080**
- **Backend**: NestJS 11 + Prisma ORM + Passport JWT at port **3001**
- **Database**: **Shared cloud Postgres** (Prisma Data Platform / same `DATABASE_URL` as Vercel API) — **no Docker**

### Starting services

See **`docs/LOCAL_DEVELOPMENT.md`** for full setup.

1. **`backend/.env`** — `DATABASE_URL`, `JWT_SECRET`, `PORT=3001` (copy from `backend/.env.example`)
2. **Migrations:** `cd backend && npx prisma generate && npx prisma migrate deploy`
3. **Backend:** `cd backend && npm run start:dev`
4. **Frontend:** `npm run dev` (port 8080; proxies `/api/v1` → localhost:3001)

### Important gotchas

- Vite port is **8080** (`@lovable.dev/vite-tanstack-config`), not 5173.
- Use relative `/api/v1` in `src/lib/api.ts` for cookie auth (not `http://localhost:3001/...` in browser code).
- **Validation (L4/L5):** local app at http://localhost:8080 + API at http://localhost:3001 — not Vercel preview.
- Never run `prisma migrate reset` on the shared cloud database.
- One agent owns `backend/prisma/schema.prisma` per migration batch.

### Test accounts (from seed)

All accounts use password: `password123`

| Role | Email | Portal |
|------|-------|--------|
| SUPER_ADMIN | superadmin@safebuyrealties.test | `/login/admin` |
| ADMIN (full) | admin@safebuyrealties.test | `/login/admin` |
| ADMIN (content) | content-admin@safebuyrealties.test | `/login/admin` |
| ADMIN (ops) | ops-admin@safebuyrealties.test | `/login/admin` |
| ADMIN (finance) | finance-admin@safebuyrealties.test | `/login/admin` |
| STAFF | staff@safebuyrealties.test | `/login/admin` |
| SELLER | seller@safebuyrealties.test | `/login/seller` |
| BUYER | buyer@safebuyrealties.test | `/login/buyer` |
| PRO (lawyer) | lawyer@safebuyrealties.test | `/login/professional` |

### Commands reference

| Action | Command |
|--------|---------|
| Frontend lint | `npx eslint .` (from root) |
| Frontend tests | `npm test` (from root, Vitest) |
| Backend tests | `cd backend && npm test` (Jest) |
| TypeScript check | `npm run validate:tsc` |
| Prisma generate | `cd backend && npx prisma generate` |
| Prisma migrate (cloud DB) | `cd backend && npx prisma migrate deploy` |
| DB seed (optional) | `cd backend && npx prisma db seed` |
| API smoke (local) | `npm run smoke:api` (defaults to localhost API) |

### Notes

- `backend/.env` is gitignored — never commit database credentials.
- ESLint may report pre-existing prettier issues in `scripts/`.
- Optional deploy checks: `docs/VERCEL_VALIDATION.md`.
