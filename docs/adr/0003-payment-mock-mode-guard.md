# ADR-0003 — Fail startup rather than silently mock payments in production

- **Status:** Proposed. Raised 2026-07-29. Recommended for immediate adoption.
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
