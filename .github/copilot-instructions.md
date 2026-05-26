# GitHub Copilot instructions

SafeBuyRealties agent workflow — same rules as [AGENTS.md](../AGENTS.md) and [docs/AGENT_PROMPT.md](../docs/AGENT_PROMPT.md).

- Pick work from [docs/BUILD_CHECKLIST.md](../docs/BUILD_CHECKLIST.md) only
- Validate on **local** stack: FE `localhost:8080`, API `localhost:3001/api/v1` — [docs/LOCAL_DEVELOPMENT.md](../docs/LOCAL_DEVELOPMENT.md)
- Cloud Postgres via `backend/.env`; never commit secrets; never `prisma migrate reset`
- Branch + PR to `main`; CI must pass before merge
