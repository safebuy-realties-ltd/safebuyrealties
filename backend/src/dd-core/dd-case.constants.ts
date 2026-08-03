import { TransactionStatus } from "@prisma/client";

/**
 * The due diligence case vocabulary, declared once for both paths that use it.
 *
 * There is one `DueDiligenceOrder` table and it serves two products. `source` tells them apart:
 * `STANDALONE` is a case bought on its own against any property, `LISTING` is a case bought against
 * a platform listing as part of a transaction. The lifecycle is the same shape in both, which is why
 * the machinery that runs it lives in `DdCoreService` rather than being written twice.
 *
 * What differs is policy, and policy stays at the call site where it can be read. The two current
 * differences are the transition table below and the exception thrown for an unverified
 * professional, and both are stated here rather than left to be discovered by diffing two services.
 */

export const DD_ORDER_STATUS = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  PAID: "PAID",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
  CANCELLED: "CANCELLED",
} as const;

export type DdOrderStatus = (typeof DD_ORDER_STATUS)[keyof typeof DD_ORDER_STATUS];

export const DD_ASSIGNMENT_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
} as const;

export type DdAssignmentStatus = (typeof DD_ASSIGNMENT_STATUS)[keyof typeof DD_ASSIGNMENT_STATUS];

/** `LISTING` or `STANDALONE`, the `source` column on `due_diligence_orders`. */
export const DD_SOURCE = {
  LISTING: "LISTING",
  STANDALONE: "STANDALONE",
} as const;

export type DdSource = (typeof DD_SOURCE)[keyof typeof DD_SOURCE];

/**
 * The listing case state table.
 *
 * A case is raised `PENDING`, becomes `SUBMITTED` when the buyer confirms it, `PAID` when money
 * lands, `IN_PROGRESS` when the first professional is assigned or the first report arrives, and
 * `COMPLETE` when an operator signs it off with a verdict. `CANCELLED` is reachable from anywhere
 * that is not already terminal, because a case can be abandoned at any point before sign-off.
 *
 * The two terminal statuses have no outward edges at all. A completed case that can be dragged back
 * to `IN_PROGRESS` is a case whose verdict means nothing, since the buyer has already been told the
 * answer and the audit trail would show the answer changing with no record of who changed it.
 */
export const LISTING_DD_TRANSITIONS: Readonly<Record<DdOrderStatus, readonly DdOrderStatus[]>> = {
  PENDING: [DD_ORDER_STATUS.SUBMITTED, DD_ORDER_STATUS.CANCELLED],
  SUBMITTED: [DD_ORDER_STATUS.PAID, DD_ORDER_STATUS.CANCELLED],
  PAID: [DD_ORDER_STATUS.IN_PROGRESS, DD_ORDER_STATUS.CANCELLED],
  IN_PROGRESS: [DD_ORDER_STATUS.COMPLETE, DD_ORDER_STATUS.CANCELLED],
  COMPLETE: [],
  CANCELLED: [],
} as const;

/**
 * The standalone path has no table, and that is deliberate rather than an oversight.
 *
 * `StandaloneDdService.updateOrder` has always accepted `IN_PROGRESS` or `COMPLETE` from whatever
 * status the case is in, and operators have been running live cases through it that way since it
 * shipped. Enforcing the table above on it here would tighten a live admin screen inside a story
 * whose own acceptance criteria say existing behaviour is unchanged, so the standalone path keeps
 * calling `applyTransition` without `assertTransition` in front of it. That is one line of
 * difference in one place, visible from this file, and it is the row to delete when a story is
 * written to bring the two together.
 */
export const STANDALONE_DD_TRANSITIONS = null;

/**
 * What a case status means for the transaction the case hangs off, where it means anything at all.
 *
 * Only two of the six say anything. A case that goes to work puts its transaction in progress, a
 * case that is signed off completes it, and the other four leave it alone. `PENDING`, `SUBMITTED`
 * and `PAID` are the transaction's own business and it is already ahead of them: by the time a case
 * reads `PAID` the money has landed and the transaction says `DD_PURCHASED`, so a case status
 * cannot tell it anything it does not know.
 *
 * `CANCELLED` mapping to nothing is the correction this table exists to make. The write it replaces
 * was a ternary whose else branch was unconditional, so every status that was not `COMPLETE` wrote
 * `DD_IN_PROGRESS`, and cancelling a case marked its transaction as in progress. There is no
 * cancelled status on the transaction enum to move to instead, and inventing one would be a schema
 * change in a story that has no business making one, so an abandoned case leaves its transaction
 * where it stands and the buyer's journey is closed by whoever closes journeys.
 */
export const DD_STATUS_TO_TRANSACTION_STATUS: Readonly<
  Record<DdOrderStatus, TransactionStatus | null>
> = {
  PENDING: null,
  SUBMITTED: null,
  PAID: null,
  IN_PROGRESS: TransactionStatus.DD_IN_PROGRESS,
  COMPLETE: TransactionStatus.DD_COMPLETE,
  CANCELLED: null,
} as const;

/** Whether a case has reached a status it cannot leave. */
export function isTerminalDdStatus(status: string): boolean {
  return status === DD_ORDER_STATUS.COMPLETE || status === DD_ORDER_STATUS.CANCELLED;
}

/** Whether `to` is reachable from `from` in `table`. A move to the status already held is a no-op. */
export function canTransitionDd(
  from: string,
  to: string,
  table: Readonly<Record<DdOrderStatus, readonly DdOrderStatus[]>>,
): boolean {
  if (from === to) return true;
  const allowed = table[from as DdOrderStatus];
  if (!allowed) return false;
  return allowed.includes(to as DdOrderStatus);
}

/** The statuses reachable from `from`, for the message on a rejected transition. */
export function allowedDdTransitions(
  from: string,
  table: Readonly<Record<DdOrderStatus, readonly DdOrderStatus[]>>,
): readonly DdOrderStatus[] {
  return table[from as DdOrderStatus] ?? [];
}
