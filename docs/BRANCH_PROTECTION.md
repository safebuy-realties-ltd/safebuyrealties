# Branch protection — `main` requires PR + green CI

GitHub **branch protection** cannot be applied via API on this private repo without **GitHub Pro**. Configure it once in the repository settings (repo owner/admin).

## Required settings for `main`

**Settings → Branches → Add branch ruleset** (or classic rule for `main`):

1. **Require a pull request before merging**
   - Required approvals: `0` (or `1` if you want human review)
   - Dismiss stale approvals: optional

2. **Require status checks to pass before merging**
   - Enable **Require branches to be up to date before merging**
   - Required check: **`CI (required)`** (job `ci-gate` in `.github/workflows/ci.yml`)
   - When both FE and BE change, also ensure these ran successfully (they are enforced inside `CI (required)`):
     - `frontend-typecheck` — `tsc` + ESLint
     - `frontend-test` — `npm test` (Vitest)
     - `backend-check` — backend `tsc` + `npm test` (Jest)

3. **Block direct pushes to `main`**
   - **Restrict who can push to matching branches** → leave empty (nobody pushes directly), **or**
   - **Do not allow bypassing the above settings** (recommended)

4. **Optional but recommended**
   - Require conversation resolution before merging (if using Codex/human review threads)
   - Include administrators in restrictions (so admins also use PRs)

## What CI runs

| Trigger | Purpose |
| -------- | -------- |
| `pull_request` → `main` | Full path-filtered checks + **`CI (required)`** gate |
| `push` → `main` | Post-merge validation only (no duplicate PR runs) |

Feature branches no longer trigger duplicate failing workflows on every `git push` (only PRs to `main` do).

## Merge checklist

- [ ] PR targets `main` (never push commits directly to `main`)
- [ ] **`CI (required)`** is green
- [ ] Path-specific jobs passed (`frontend-typecheck`, `frontend-test`, `backend-check` as applicable)
- [ ] Vercel preview OK when FE/BE/schema changed

## Agents / automation

- Never `git push origin main`
- Always: branch → push → PR → wait for **`CI (required)`** → merge on GitHub

See also `docs/GIT_WORKFLOW.md` and `docs/DEVELOPMENT_GUIDE.md`.
