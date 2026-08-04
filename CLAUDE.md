# Claude / general AI instructions

Follow **[AGENTS.md](AGENTS.md)** and **[docs/AGENT_PROMPT.md](docs/AGENT_PROMPT.md)**.

- Work queue: **[docs/MVP_OUTSTANDING_BACKLOG.md](docs/MVP_OUTSTANDING_BACKLOG.md)** (one story at a
  time). `docs/BUILD_CHECKLIST.md` is the historical record of what was built, not the queue: every
  box in it is ticked, so an agent starting there concludes the project is finished
- Local dev & E2E: **[docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md)**
- Do not use Docker; do not require Vercel preview for checklist `[x]`
- **Every story PR brings three documents up to date in the same diff, and CI fails a PR that changes
  `src/`, `backend/`, `scripts/`, `docs/` or the workflows without touching all three.** Rule 8 in
  **[docs/HANDOVER_WEEK.md](docs/HANDOVER_WEEK.md)** has the full tables and the two escape hatches
  - **[docs/mvp-board.html](docs/mvp-board.html)**: the unit of update is the page, not the row. The
    row, its day card, the counter tiles, the header, the review queue and the prose that quotes any
    count you moved. Then `npm run validate:board`
  - **[docs/MVP_OUTSTANDING_BACKLOG.md](docs/MVP_OUTSTANDING_BACKLOG.md)**: the epic-table row's
    status, the story entry's **Merged** line, a **Delivered** section saying what you did not
    deliver as well as what you did, and a dated reconciliation note if a dependency moved
  - **[docs/BUILD_CHECKLIST.md](docs/BUILD_CHECKLIST.md)**: **Last Session Notes** at the top, with
    date, last completed, what is next, blockers
