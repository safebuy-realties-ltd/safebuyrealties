# Git workflow — branch + pull request

Do **not** push feature work directly to `main`. Use this flow for all checklist and fix work.

## Standard flow

```bash
git checkout main
git pull origin main
git checkout -b fix/short-description   # or feat/…

# … implement, validate …

git add …
git commit -m "fix: clear message"
git push -u origin fix/short-description

gh pr create --base main --title "…" --body "…"
```

After review, **merge the PR on GitHub** (squash or merge commit per team preference). Vercel preview deploys run on the PR branch automatically.

## Agent sessions

1. Confirm you are **not** on `main` before the first commit (create branch first).
2. Never `git push origin main` unless explicitly asked for a hotfix.
3. Put validation notes in the PR body (smoke commands, URLs tested).

## Environment secrets

- Local: `backend/.env` (gitignored)
- Vercel API project (`safebuyrealties`): sync Paystack with  
  `node scripts/sync-paystack-env-vercel.mjs`  
  after updating keys locally.

## CI before merge

PRs to `main` must pass the **`CI (required)`** check (aggregate gate in `.github/workflows/ci.yml`):

| Job | When it runs | Commands |
| --- | --- | --- |
| `frontend-typecheck` | Frontend paths changed | `tsc`, `eslint` |
| `frontend-test` | Frontend paths changed | `npm test` (Vitest) |
| `backend-check` | `backend/**` changed | `tsc`, `npm test` (Jest) |
| **`CI (required)`** | Every PR to `main` | Fails if any applicable job above failed |

- Do **not** merge if **`CI (required)`** or any applicable job is red.
- Re-run `npm run validate:tsc` and `npm test` locally if CI fails.

## Protect `main` (no direct pushes)

Configure branch protection in GitHub (one-time, repo admin). This repo cannot set rules via API on the free private plan — use the UI:

**See `docs/BRANCH_PROTECTION.md`** for step-by-step settings (require PR, require **`CI (required)`**, block direct push to `main`).

## Related docs

- `docs/BRANCH_PROTECTION.md` — require PR + green CI on `main`
- `docs/DEVELOPMENT_GUIDE.md` — TDD, validation layers, step roadmap
- `docs/AGENT_PROMPT.md` — agent loop
- `docs/VERCEL_VALIDATION.md` — deploy testing
- `docs/VALIDATION_REPORT.md` — last known E2E status
