import { TransactionStatus } from "@prisma/client";

/**
 * The purchase transaction state table, declared once for every path that moves a transaction.
 *
 * A `Transaction` is the buyer's whole journey against one property, and it outlives the due
 * diligence case hanging off it. It is raised `INITIATED` when a buyer opens it or a guest checks
 * out, reaches `IN_PROGRESS` when a payment is started, `DD_PURCHASED` when that payment lands,
 * `DD_IN_PROGRESS` when the first professional is put on the case or the first report arrives, and
 * `DD_COMPLETE` when an operator signs the case off with a verdict. From there it is a property
 * purchase rather than a due diligence case: `PURCHASE_IN_ESCROW` while the money is held and
 * `COMPLETED` when escrow releases and the listing is marked sold.
 *
 * `COMPLETED` is the only terminal status. Every edge out of it is absent on purpose, because a
 * released escrow that can be dragged back into due diligence is a sold property that can be
 * unsold with no record of who unsold it.
 *
 * Two entries are worth reading twice.
 *
 * `DD_PURCHASED` reaches `DD_COMPLETE` without passing through `DD_IN_PROGRESS`. That is not a
 * shortcut for convenience, it is what a small case looks like. An operator can sign off a case
 * that was answered from documents already on file, and no professional was ever assigned to it.
 *
 * `PURCHASE_PENDING` has an edge in and an edge out and nothing in the codebase writes it today.
 * `EscrowService` reads it as one of the statuses that satisfy the due diligence release condition,
 * so the value is live in a decision even though no path sets it. It is declared here rather than
 * dropped, because dropping it would make the release condition read against a status this table
 * says cannot exist.
 */
export const TRANSACTION_TRANSITIONS: Readonly<
  Record<TransactionStatus, readonly TransactionStatus[]>
> = {
  INITIATED: [TransactionStatus.IN_PROGRESS, TransactionStatus.DD_PURCHASED],
  IN_PROGRESS: [TransactionStatus.DD_PURCHASED],
  DD_PURCHASED: [TransactionStatus.DD_IN_PROGRESS, TransactionStatus.DD_COMPLETE],
  DD_IN_PROGRESS: [TransactionStatus.DD_COMPLETE],
  DD_COMPLETE: [TransactionStatus.PURCHASE_PENDING, TransactionStatus.PURCHASE_IN_ESCROW],
  PURCHASE_PENDING: [TransactionStatus.PURCHASE_IN_ESCROW],
  PURCHASE_IN_ESCROW: [TransactionStatus.COMPLETED],
  COMPLETED: [],
} as const;

/** Whether a transaction has reached a status it cannot leave. */
export function isTerminalTransactionStatus(status: TransactionStatus): boolean {
  return TRANSACTION_TRANSITIONS[status].length === 0;
}

/**
 * Whether `to` is reachable from `from`.
 *
 * A move to the status already held is legal and means nothing happened. That is what makes a
 * replayed completion safe rather than a 409: the caller asked for a state the transaction is
 * already in, and being told that is a conflict would turn a retried webhook into an error page.
 */
export function canTransitionTransaction(from: TransactionStatus, to: TransactionStatus): boolean {
  if (from === to) return true;
  return TRANSACTION_TRANSITIONS[from].includes(to);
}

/** The statuses reachable from `from`, for the message on a rejected move. */
export function allowedTransactionTransitions(
  from: TransactionStatus,
): readonly TransactionStatus[] {
  return TRANSACTION_TRANSITIONS[from];
}

/**
 * The statuses that may legally move to `to`, derived from the table rather than restated.
 *
 * This is the inverse of the table and it exists for the write itself. Moving a transaction is one
 * `updateMany` whose `where` carries the legal predecessors, so the check and the write are a
 * single statement that a concurrent writer cannot slip between. Restating the inverse by hand
 * would let the two halves drift, which is the exact bug a state table is supposed to prevent.
 */
export function transactionPredecessors(to: TransactionStatus): readonly TransactionStatus[] {
  return (Object.keys(TRANSACTION_TRANSITIONS) as TransactionStatus[]).filter((from) =>
    TRANSACTION_TRANSITIONS[from].includes(to),
  );
}
