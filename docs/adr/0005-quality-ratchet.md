# ADR-0005 — Raise the quality bar as a ratchet, not retroactively

- **Status:** Proposed. Raised 2026-07-29.
- **Backlog reference:** decision D5, stories E7-S2 and E7-S3.

## Context

CI runs TypeScript compile, ESLint with zero warnings, and unit tests behind one required gate. There is no
coverage threshold in `backend/jest.config.js` or `vitest.config.ts`, no static analysis gate, no mutation
testing, and none of the six end-to-end scripts in `scripts/` run in CI. Test material is 24 backend spec files
and 7 frontend test files, mostly around library helpers.

A mature reference bar exists in a sibling project: full coverage plus mutation testing on new code, zero
static-analysis issues and zero duplication on new code, observability on every endpoint, and no unhandled 5xx.

Applying that bar to the whole repository at once would stall delivery for weeks and produce a large volume of
low-value backfill.

## Decision

Apply the strict bar to **new and touched code only**. Measure the current coverage level, record it as the
floor, and forbid regressions below it. Each story raises the floor where it touches code. Existing debt is
tracked rather than gated.

## Consequences

The floor must be measured and recorded in the pull request that introduces the gate, otherwise the ratchet has
no starting point.

This mirrors the sibling project's own resolution of the same tension, where an absolute dependency-advisory
gate was replaced by a delta gate plus a tracked baseline carrying a remediation SLA. The lesson transfers:
gate what a change introduces, track the rest with an owner and a date.
