# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview

SafeBuyRealties is a real estate transaction platform with:
- **Frontend**: TanStack Start (React 19) + Vite + Tailwind CSS v4 + shadcn/ui at port 8080 (Vite dev server)
- **Backend**: NestJS 11 + Prisma ORM + Passport JWT at port 3001
- **Database**: PostgreSQL 16 via Docker Compose (`backend/docker-compose.yml`)

### Starting services

1. **PostgreSQL**: `cd backend && docker compose up -d` (requires Docker daemon running: `sudo dockerd &`)
2. **Backend**: `cd backend && npm run start:dev` (port 3001, hot-reload via `nest --watch`)
3. **Frontend**: `npm run dev` (port 8080, Vite proxy forwards `/api/v1` to backend)

### Important gotchas

- The `@lovable.dev/vite-tanstack-config` plugin overrides the Vite port to **8080** (not the 5173 documented elsewhere).
- The Vite proxy at `/api/v1` → `http://localhost:3001` is configured in `vite.config.ts`. The frontend code in `src/lib/api.ts` must use relative `/api/v1` paths (not direct `http://localhost:3001/api/v1`) for browser cookie auth to work in local dev.
- Docker daemon must be started manually in Cloud VMs: `sudo dockerd &>/tmp/dockerd.log &` then `sudo chmod 666 /var/run/docker.sock`.
- The Docker storage driver is configured as `fuse-overlayfs` and iptables uses legacy mode (required for nested Docker in Firecracker VMs).

### Test accounts (from seed)

All accounts use password: `password123`

| Role | Email |
|------|-------|
| ADMIN | admin@safebuyrealties.test |
| STAFF | staff@safebuyrealties.test |
| SELLER | seller@safebuyrealties.test |
| BUYER | buyer@safebuyrealties.test |
| PRO (lawyer) | lawyer@safebuyrealties.test |

### Commands reference

| Action | Command |
|--------|---------|
| Frontend lint | `npx eslint .` (from root) |
| Frontend tests | `npm test` (from root, Vitest) |
| Backend tests | `cd backend && npm test` (Jest) |
| TypeScript check | `npm run validate:tsc` (checks both FE + BE) |
| Prisma generate | `cd backend && npx prisma generate` |
| Prisma migrate | `cd backend && npx prisma migrate deploy` |
| DB seed | `cd backend && npx prisma db seed` |
| DB up/down | `cd backend && npm run db:up` / `npm run db:down` |

### Notes

- Backend `.env` file must exist at `backend/.env` with `DATABASE_URL`, `JWT_SECRET`, and `PORT` at minimum.
- The Prisma `package.json#prisma` config is deprecated but still functional — ignore the deprecation warning.
- ESLint will report pre-existing prettier formatting errors in utility scripts (`scripts/`) — these are in the existing codebase.
