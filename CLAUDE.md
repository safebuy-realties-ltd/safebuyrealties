# Claude / general AI instructions

Follow **[AGENTS.md](AGENTS.md)** and **[docs/AGENT_PROMPT.md](docs/AGENT_PROMPT.md)**.

- Work queue: **[docs/BUILD_CHECKLIST.md](docs/BUILD_CHECKLIST.md)** (one item at a time)
- Local dev & E2E: **[docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md)**
- Do not use Docker; do not require Vercel preview for checklist `[x]`
- **Every story PR updates [docs/mvp-board.html](docs/mvp-board.html) in the same diff** — the row's
  status, PR number and Day column — then `npm run validate:board`. CI fails a PR that changes
  `src/`, `backend/`, `scripts/`, `docs/` or the workflows without touching the board. Rule 8 in
  **[docs/HANDOVER_WEEK.md](docs/HANDOVER_WEEK.md)** has the table and the escape hatch
