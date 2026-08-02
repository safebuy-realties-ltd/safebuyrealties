# ADR-0001 — MVP scope: does the on-platform property purchase stay in?

- **Status:** **Accepted 2026-08-02.** Option A: the on-platform property purchase is in the MVP. Raised
  2026-07-29 during the handover audit, open for four days, answered by the stakeholders as the first of the
  seven asks.
- **Deciders:** client, product lead. Not engineering's to make alone, and it was not made here.
- **Recorded by:** story DOCS-7, PR #135. The answer came back against EXT-7, which asks for confirmation of
  this decision and of ADR-0002.
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

## Decision

**Option A. Buying a property on the platform is part of the MVP.** The wizard gets finished rather than
retired, and the code written for the listing path gets the journey it has been missing.

What that settles, in the order it matters:

1. **E1 goes back on the schedule, and it can start now.** All four of its stories were parked behind this
   decision and behind nothing else. E1-S1 has no other dependency at all. E1-S2 and E1-S3 follow E1-S1,
   E1-S4 follows E1-S2, and E1-S3's second dependency, E3-S1, closed during the handover week when #112 took
   the public static mount out. Eleven to fourteen developer-days, and it is the first work since the waves
   ended that a developer can pick up without waiting for anybody.
2. **Escrow and the Power of Attorney stop being dormant code.** Both were built for a journey that stops at
   payment. E1-S4 is the story that connects them, which is why option B would have retired them and option
   A does not.
3. **E2 stays in the MVP, and its own blocker does not move.** E2-S1 waits on E1-S4 and on **ADR-0002**,
   which is still open, so answering D1 buys E2 nothing by itself. The half of EXT-7 still outstanding is
   the escrow money model, and it is now the only thing standing between the platform and a real seller
   being paid.
4. **G1 becomes a gate somebody can reach.** "A buyer completes the on-platform journey on staging unaided"
   was a gate against work nobody was allowed to start. It is now a gate against work in progress.
5. **The dead end stays dead-ended until E1-S4 merges, and that is the risk this decision accepts.** Option
   A does not fix the half-wired wizard by being chosen, it fixes it by being built, so the flow keeps
   taking payment into a transaction that goes nowhere for as long as E1 is open. The feature flags
   `dd_case_lifecycle` and `property_purchase` exist for exactly that window, and both are off by default in
   the CH-1 registry.

## Consequences

Choosing A commits to the money-integrity work in E2, which is itself gated on ADR-0002.

Choosing B would have been defensible and cheaper, but it had to be an explicit decision with the wizard
removed. Leaving a payment-taking flow that dead-ends is the worst of the three outcomes, and it is where the
code was on the day this was raised. A is chosen, so that dead end is now scheduled work rather than a
standing decision, and the thing to watch is that E1 finishes rather than stalls half-built.

The roughly 20 days option B would have removed stay in the plan. The Full backlog figure on
`docs/mvp-board.html` does not move, because it has always counted E1 and E2 at their published sizes. What
moves is that four of the nineteen remaining stories are startable rather than blocked.
