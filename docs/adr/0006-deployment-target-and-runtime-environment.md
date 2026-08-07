# ADR-0006 — Deployment target, storage region, and how a process knows which environment it is

- **Status:** Proposed. Raised 2026-08-07. The direction was given in engineering session by the
  repository owner; a named acceptance is outstanding and the block at the foot of this file is
  where it goes.
- **Backlog reference:** decision D4, story E7-S7 (this PR). Releases the region half of E3-S2, and
  through it E3-S3 and E7-S4.

## Context

Three things are decided here rather than one, because they are the same decision seen from three
angles. Where the application runs decides where documents can live, and both of them decide what a
process is allowed to assume about itself when nobody tells it.

### Where it runs today, and why that is a problem

The platform runs on Vercel. Two consequences follow from that and neither is a preference.

The filesystem is read-only except for `/tmp`, which is wiped between invocations. That is why
`backend/src/storage/storage.service.ts` routes uploads into `/tmp` when it sees `VERCEL` in the
environment, and it is the whole reason story E3-S2 exists: an uploaded title document does not
survive the deployment that received it.

Vercel is also not Nigerian infrastructure, and the platform holds production personal data on it,
including the identity documents in `KycRecord`. That is the exposure `docs/inputs/SB DATA
PROTECTION POLICY.docx` §12 is about, and it exists now rather than at some future cutover.

### Where documents live

Decision D4 has been open since this backlog was written on 2026-07-29 and blocked since
2026-08-05. EXT-11 came back on 2026-08-06 and settled which rule governs: the **NDPA 2023** and the
**GAID 2025** are the instruments, a company document cannot lower a statutory floor, and DPP §12's
closed list of three conditions is therefore the transfer rule rather than the published privacy
policy's "reasonable steps". What EXT-11 did not answer is which of the three conditions the
running infrastructure sits under, and that unanswered half is what kept D4 blocked.

### How a process knows which environment it is

Three definitions of "this is production" existed, and they agreed often enough to look harmless.

- `isProductionEnvironment()` in `backend/src/config/payments-guard.ts`, reading `NODE_ENV` or
  `VERCEL_ENV`.
- `isProductionLike()` in `backend/src/config/cors-config.ts`, its own copy of nearly the same test.
- Five bare `process.env.NODE_ENV === "production"` comparisons in auth, logging and the exception
  filter.

They shared a defect. `nodeEnv()` in the payments guard read `env.NODE_ENV?.trim() || "development"`,
so **an environment that declared nothing was treated as a developer's laptop**. On a real server
that means session and refresh cookies issued without the `Secure` flag, unhandled exception text
returned to the caller, debug logging left on, and `PAYSTACK_FORCE_MOCK` honoured, which writes
payouts as `COMPLETED` without moving money. The last of those is the exact failure ADR-0003 exists
to prevent, reachable by a route ADR-0003 does not describe, and the cutover is what opens it.

Vercel sets `NODE_ENV` on every deployment, which is the only reason this never fired. It is an
accident of the vendor, not a property of the code, and it is the first thing a move loses.

The database guard had the mirror-image fault. `assertSafeDatabaseUrl()` ran anywhere `NODE_ENV` was
not exactly `production`, so an undeclared deployment hit a developer-machine check and refused to
boot. That failure is loud, which sounds better than it is: the message told the operator to set
`SBR_CONFIRM_CLOUD_DATABASE_URL=true`, and doing so starts the process and leaves every other
`NODE_ENV`-keyed default sitting in its development state. The genuinely silent path is a database
on `localhost`, which is the likely shape of a self-hosted deployment, because then the check passes
without a word and nothing at all is said.

## Decision

**1. The deployment target is self-managed Nigerian infrastructure.** A long-running process with a
writable disk and an operator-set environment, rather than a serverless platform that supplies both
by convention. Vercel is left.

**2. Object storage is an S3-compatible bucket in a Nigerian region.** Production documents do not
leave Nigeria.

**3. There is one definition of the runtime environment, it is declared by the operator, and an
undeclared environment is production.** `backend/src/config/runtime-environment.ts` is that
definition and every other site delegates to it.

- `APP_ENV` is the authoritative signal. `NODE_ENV` and `VERCEL_ENV` are still read.
- All three are read and **the most hardened value any of them claims wins**, rather than the first
  one that happens to be set. A signal can raise the environment and can never lower it, so
  `APP_ENV=development` on a box whose `VERCEL_ENV` says production resolves to production.
- Nothing set, or a value the application does not recognise, resolves to `unknown`, and `unknown`
  is treated as production everywhere.
- Local development declares itself through the `start` and `start:dev` npm scripts, and the test
  runners set `NODE_ENV=test` themselves, so no developer has to remember anything.
- The process says so once at boot when nothing declared the environment. It warns and does not
  exit, because the undeclared case is now the safe case and refusing to start would buy only
  downtime.

## Consequences

**D4's region half is closed, and closed by removing the question rather than by answering it.** A
Nigerian bucket means no transfer outside Nigeria, so DPP §12 does not engage and none of its three
conditions has to be met. There is nothing left for the unanswered half of EXT-11 to block. This
**complies with** the EXT-11 ruling rather than overriding it, since that ruling was made by the
Managing Director/CEO and the Board, so it needs no new legal signature to be correct. It also
closes the existing exposure rather than only avoiding a future one.

**No NDPC cross-border transfer instrument is needed.** That was a legal dependency with an outside
party and an unknown lead time, and it is off the critical path entirely.

**Nothing sets `NODE_ENV` for us any more.** That is the whole justification for the fail-closed
default: the failure mode of forgetting to declare is now a hardened server rather than an open one.

**A staging box whose `APP_ENV` was forgotten claims to be production.** That is the cost of the
default and it is accepted. It is hardened correctly, it is not wrong in the dangerous direction, and
it says so in a warning at boot naming the variable to set.

**Staging and production are distinguished, which they were not before.** `VERCEL_ENV=preview` maps
to staging rather than to development, so a preview gets hardened defaults, and staging does not
carry the production-only obligation to hold a live payment credential. Two predicates express the
difference: `!isDevelopmentOrTest()` for defaults that should be hardened anywhere that is not a
laptop, and `isProductionEnvironment()` for the refuse-to-start guards.

**The database guard is narrowed to where it belongs.** It runs on a developer machine and under the
test runner and nowhere else, and its message no longer instructs an operator to disarm anything.

**E3-S2 can be designed and built against a Nigerian-region S3-compatible bucket.** It still needs
EXT-2 for the bucket itself and its credentials, so the code half is unblocked and the verification
half is not.

**`VERCEL_ENV` stays in the resolver until the cutover finishes.** Previews rely on it, and deleting
it early would silently downgrade every preview to `unknown`. It is now the last of three signals
rather than half the definition.

## What this does not decide

- **Which host, and which bucket vendor.** That is EXT-2, and it is a procurement answer rather than
  an architectural one. Any S3-compatible provider with a Nigerian region satisfies this ADR.
- **The rest of the Vercel cutover.** `storage.service.ts:35` and `:40` still read `process.env.VERCEL`
  to decide whether the filesystem is writable, which is a capability question and not an environment
  question, and it belongs to E3-S2. The `/api/v1` rewrite and the `VERCEL_TEAM_SLUG` preview origins
  in `cors-config.ts` are also still there. None of them is a safety defect; all of them are cutover
  work.
- **When the cutover happens, or its runbook.** This says where it lands, not on what date.

## Acceptance

Outstanding. The engineering direction has been taken and built against; the record of a named
officer accepting it has not been made.

- **Accepted as written by:** _(name)_
- **Role:** _(role)_
- **Date:** _(date, West Africa Time)_

Two of the three decisions above want that signature and one does not. Decision 3 is an engineering
correction to a defect and needs no business acceptance. **Decisions 1 and 2 commit the company to a
hosting posture and to a data residency position**, and those are the ones a named decider should
accept, in the same form as ADR-0003 and ADR-0004. Until then this file reads Proposed, and no box
anywhere is ticked on the strength of it.
