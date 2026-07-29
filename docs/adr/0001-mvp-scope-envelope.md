# ADR-0001 — MVP scope: does the on-platform property purchase stay in?

- **Status:** Proposed (awaiting owner decision). Raised 2026-07-29 during the handover audit.
- **Deciders:** client, product lead. Not engineering's to make alone.
- **Backlog reference:** decision D1, epics E1 and E2.

## Context

Two due diligence paths exist in the codebase and only one is complete.

The **standalone** path (`src/standalone-dd/`, 1590 lines) handles an off-platform property: request, pay,
assign professionals, collect reports, staff verdict, completion, receipt. It works end to end.

The **listing** path is the seven-step purchase wizard. It creates a `DueDiligenceOrder` and takes payment,
and then stops. `DueDiligenceService` has one method, `create()`. Nothing sets the transaction to
`DD_COMPLETE`, the buyer is never offered the property purchase, escrow is never funded, no seller is paid.

Escrow, Power of Attorney and the dual payment intents were built for the listing path. They currently have
no journey that reaches them.

## Decision required

Option A, **on-platform purchase is in scope**. Build E1 (about 14 days) and then E2 (about 15 days). Escrow
and PoA start paying off. This is what the demo and the client's expectations describe.

Option B, **standalone due diligence is the MVP**. Retire or hide the purchase wizard rather than leaving it
half-wired, and accept that escrow, PoA and the property-purchase payment intent are dormant code. Removes
roughly 20 days of work.

## Consequences

Choosing A commits to the money-integrity work in E2, which is itself gated on ADR-0002.

Choosing B is defensible and cheaper, but it must be an explicit decision with the wizard removed. Leaving a
payment-taking flow that dead-ends is the worst of the three outcomes, and it is where the code is today.
