# ADR-0003 — Fail startup rather than silently mock payments in production

- **Status:** **Accepted as written, 2026-08-07**, by Adebiyi Emmanuel Babatope, Chief Operating
  Officer. Raised 2026-07-29.
- **Effective:** 2026-08-07. The behaviour described below has been live in production since
  2026-07-30, when E2-S4 merged. This records a management decision about behaviour that was
  already running; it does not authorise anything new.
- **Backlog reference:** story E2-S4.

## Context

`PaystackService.isConfigured()` returns false when no secret key is present, and also when
`PAYSTACK_FORCE_MOCK` is set. `EscrowService.initiatePayout` branches on it and records the payout as
`COMPLETED` with a `mock_transfer_...` reference. Nothing checks the environment.

A production deploy with a missing, blanked or rotated-away Paystack key therefore reports every seller as
paid, in the database, with no error and no operator-visible signal.

## Decision

Refuse to start. When the environment is production and no payment credential is present, the application
fails at boot with a clear message rather than degrading to mock behaviour. `PAYSTACK_FORCE_MOCK` is ignored
outside development and test. Mock payments and payouts carry an explicit flag on the record and render with
a visible badge in every operator view.

## Consequences

A misconfigured production deploy becomes a loud failure instead of a quiet financial fiction. The cost is that
a missing environment variable takes the API down, which is the correct trade for a money path and is the
standard fail-closed posture.

This is a one-day story and it removes the single worst failure mode in the codebase. It should land before any
other payment work.

## Acceptance, 2026-08-07

Accepted as written by **Adebiyi Emmanuel Babatope, Chief Operating Officer**, answering
`ENG-CS-2026-08-06-01`. Nothing above this heading was changed by the acceptance, which is why the
Decision and Consequences read exactly as they did when they were put up on 2026-07-29.

The trade-off was accepted in terms: where the production Paystack credential is missing or blank
the API refuses to start, and that takes the whole API down rather than degrading payments. In the
decider's words, that is preferable to a platform that processes or records payments incorrectly, or
that tells a seller they have been paid when no money moved. The decider separately acknowledged
that `PAYSTACK_FORCE_MOCK` is ignored in production with a warning while real payment processing
continues, which is what the code does rather than what a reader might assume from "ignored".

**Two dates appear in the return and both are recorded here.** Question 4, which is the question
that asked for the effective date, answers 2026-08-07 and instructs that the shipped behaviour be
recorded separately as live since 2026-07-30. The summary paragraph in the same return says
effective 2026-08-06. The effective date used is 2026-08-07, because that is the answer to the
question that asked, and because the decider signed on 2026-08-07 West Africa Time.

### Two qualifications found when the ADR was checked against the code

Neither changes the decision. Both are recorded so that nobody later reads the accepted text as a
description of something it does not quite say.

1. **The mock flag is derived, not stored.** The Decision says mock payments "carry an explicit flag
   on the record". No column in `backend/prisma/schema.prisma` holds one. The flag is computed at
   read time from the reference prefix by `isMockReference()` in
   `backend/src/config/payments-guard.ts`, and both read paths do it:
   `backend/src/payments/payments.service.ts` and `backend/src/escrow/escrow.service.ts`. Every
   operator view therefore shows the badge, so the promise holds in effect. It holds because the
   prefix is never rewritten, not because a column asserts it.
2. **Production is detected from two signals and one of them is Vercel's.**
   `backend/src/config/payments-guard.ts` treats an environment as production when `NODE_ENV` is
   `production` **or** `VERCEL_ENV` is `production`. A move off Vercel removes the second signal and
   leaves `NODE_ENV` carrying the guard alone. **A host that does not set `NODE_ENV=production`
   would silently reinstate the exact failure this ADR exists to prevent**, with no error, because
   the guard would read the environment as non-production and honour mock mode. This belongs on the
   cutover checklist for any hosting change, and it is a deployment hazard rather than a defect in
   the decision accepted here.
