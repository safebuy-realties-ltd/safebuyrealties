# Parallel agent prompt pack

**Baseline:** Step 2 complete on `main`. Local validation only — see [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).

**Coordinator:** Max 3–4 parallel agents; one Prisma schema owner per wave.

## Shared preamble (every agent)

```markdown
You are a senior full-stack engineer on SafeBuyRealties.

## Read first
1. AGENTS.md
2. docs/AGENT_PROMPT.md
3. docs/LOCAL_DEVELOPMENT.md
4. docs/BUILD_CHECKLIST.md — your assigned item only

## Already done (Step 2) — do not rebuild
Listing spec schema, object storage, audit logging, platform config, property spec FE.

## Validation (required before [x])
- Local API: http://localhost:3001/api/v1 (npm run smoke:api)
- Local UI: http://localhost:8080
- npm run validate:tsc; npm test; cd backend && npm test
- No Docker; no Vercel preview required
- backend/.env has cloud DATABASE_URL — never commit .env

## Git
- Branch: cursor/<topic>-e4ea from main
- One checklist item per PR; CI green before merge
```

## Wave 1 — Step 3 kickoff (up to 3 parallel)

| Track | Branch | Item | Schema? |
| ----- | ------ | ---- | ------- |
| W1-A | `cursor/step3-listing-status-db-e4ea` | Listing status — database | **Yes — merge first** |
| W1-B | `cursor/step3-listing-status-fe-e4ea` | Listing status — frontend | After W1-A; extend `src/lib/listing-status.ts` |
| W1-C | `cursor/step3-risk-flags-ui-e4ea` | Risk flag taxonomy + UI | No |

## Wave 2 — Step 3 continued

| Track | Branch | Item |
| ----- | ------ | ---- |
| W2-A | `cursor/step3-pro-credentials-e4ea` | Professional credential profile |
| W2-B | `cursor/step3-report-revision-loop-e4ea` | Report accept / revision loop |

Serialize schema between W2-A and W2-B if both touch verification enums.

## Wave 3 — Step 4 (after platform config on main)

| Track | Branch | Item |
| ----- | ------ | ---- |
| W3-A | `cursor/step4-service-catalog-api-e4ea` | Catalog DB + seed + API |
| W3-B | `cursor/step4-service-selector-fe-e4ea` | ServiceSelector UI (after W3-A API) |

## Progress

| Milestone | Items `[x]` | ~% |
| --------- | ------------- | --- |
| Now (Step 2 done) | 10 / 51 | 20% |
| After Step 3 | 15 / 51 | 29% |

Full per-track prompts: copy shared preamble + checklist item text from BUILD_CHECKLIST.md.
