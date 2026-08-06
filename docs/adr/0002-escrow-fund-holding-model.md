# ADR-0002 — Escrow: does SafeBuyRealties hold client funds?

- **Status:** Accepted. Raised 2026-07-29, answered 2026-08-05.
- **Deciders:** client, counsel, finance. Engineering implements the answer.
- **Backlog reference:** decision D2, stories E2-S1 and E2-S3, gate G6.
- **Provenance:** SBR-FIN-DEV-SPEC-20260803-V1.5, approved for implementation by the CFO, verbal and
  WhatsApp, relayed 2026-08-05. Approved for implementation only. Section 14.2 withholds approval for
  production activation, which is a second gate and is not this decision.

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

## Decision

**SafeBuyRealties holds client funds.** The platform operates a ring-fenced escrow bank account, and escrow
principal sitting in it is a client-funds liability rather than platform revenue.

The answer is not an opinion relayed second hand. It is what the approved specification requires in order to be
implementable at all. Section 11.1 obliges the platform to reconcile an escrow bank balance against the sum of
the per-transaction escrow sub-ledgers, and only the operator of an account can be put under that obligation.
Sections 1.3 and 11.3 then say what the balance is: a liability owed to the parties, never income. Section 14.2
requires it held apart from operating money. A platform that merely orchestrated payments between other people's
accounts would have nothing to reconcile, nothing to ring-fence and no liability to carry.

So the second reading in "Decision required" is closed. The money does rest with the platform, and every
consequence below is now a commitment rather than a branch.

## Consequences

E2-S1 is not a bank-details form. It carries reconciliation duties, CBN and AML obligations, and a settlement
account with its own controls. That is now the story's scope rather than a risk it might have.

The chart of accounts has to model the liability explicitly, which is why `main_accounts` carries `isLiability`
and `ringFenced` as two separate columns rather than one flag: an account being held apart and an account being
owed to somebody are different claims, and a design that collapsed them would let a future account be
ring-fenced and counted as income at the same time. E9-S1 ships those columns; E9-S3 writes the rows.

Approval to build is not approval to operate. Everything downstream of this decision ships behind the
`financial_governance` flag, default off, until section 14.2's second gate closes. An escrow account that exists
in the schema and is switched off in production is the intended state for now.

A per-seller payout destination with name resolution and confirmation is still required and still missing. The
current single-account default must never reach production; ADR-0003's startup guard is the interim protection.

## Still open, and not settled by this

The signed instruments have not caught up with the specification. No document the seller signs authorises the
VAT withholding that section 4's formula and Appendix C's worked example both assume, and the commission rate
appears in four sources with three different readings. Both are with Finance and counsel. Neither blocks E9-S1,
which ships tables and no rates, and both block E9-S3, which cannot write a rate down until they are answered.
