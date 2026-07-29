# ADR-0002 — Escrow: does SafeBuyRealties hold client funds?

- **Status:** Proposed (awaiting owner and counsel). Raised 2026-07-29.
- **Deciders:** client, counsel, finance. Engineering implements the answer.
- **Backlog reference:** decision D2, stories E2-S1 and E2-S3, gate G6.

## Context

`EscrowService` implements hold, release conditions, release, refund and payout as a ledger. Two things are
not settled, and both are legal rather than technical.

`initiatePayout` resolves the destination bank account from `PAYSTACK_PAYOUT_BANK_CODE` and
`PAYSTACK_PAYOUT_ACCOUNT_NUMBER`, which default to Paystack's test account `057 / 0000000000`
(`paystack.service.ts:119`). There is no seller bank account anywhere in the schema. Every payout currently
goes to the same account regardless of who sold the property.

`refund()` updates the escrow row, resets the listing and notifies both parties. It never calls the gateway.

## Decision required

Whether funds pass through a controlled settlement account that SafeBuyRealties operates, or whether the
platform only orchestrates and the money never rests with it.

## Consequences

If the platform holds funds, E2-S1 is not a bank-details form. It brings reconciliation duties, CBN and AML
obligations, and a settlement account with its own controls. The story should not start until this is answered,
because the two designs are not refactors of each other.

Either way, a per-seller payout destination with name resolution and confirmation is required. The current
single-account default must never reach production; ADR-0003's startup guard is the interim protection.
