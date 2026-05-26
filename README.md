# SafeBuyRealties

Nigerian real estate verification and transaction platform (TanStack Start + NestJS + Prisma).

## For humans

| Doc | Purpose |
| --- | --- |
| [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) | **Start here** — run FE + BE locally, cloud Postgres, validation |
| [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) | TDD, PR workflow, validation layers |
| [docs/BUILD_CHECKLIST.md](docs/BUILD_CHECKLIST.md) | Ordered feature queue (`[ ]` / `[x]`) |
| [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) | Branch → PR → merge (never push `main` directly) |

## For AI agents (any platform)

Read in this order:

1. **[AGENTS.md](AGENTS.md)** — architecture, ports, commands (Cursor Cloud, Codex, Copilot, Claude, etc.)
2. **[docs/AGENT_PROMPT.md](docs/AGENT_PROMPT.md)** — working loop, validation rules, handoff
3. **[docs/BUILD_CHECKLIST.md](docs/BUILD_CHECKLIST.md)** — first `[ ]` or `[~]` item only
4. **[docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md)** — local E2E (not Vercel preview)

**Validation default:** `http://localhost:8080` (app) + `http://localhost:3001/api/v1` (API). Shared cloud `DATABASE_URL` in `backend/.env` (see `backend/.env.example`). **No Docker.**

Optional after merge: [docs/VERCEL_VALIDATION.md](docs/VERCEL_VALIDATION.md).

## Quick start

```bash
npm install
cd backend && npm install
cp backend/.env.example backend/.env   # set DATABASE_URL (cloud Postgres)

cd backend && npx prisma generate && npx prisma migrate deploy
cd backend && npm run start:dev        # :3001
npm run dev                            # :8080
```

```bash
npm run validate:tsc
npm test
cd backend && npm test
npm run smoke:api
```

Seed logins: `*@safebuyrealties.test` / `password123` (see LOCAL_DEVELOPMENT.md).
