import { LoggerService } from "@nestjs/common";

/**
 * E7-S1 criterion 5: money moves loudly.
 *
 * Every payment, escrow and payout operation says what it is about to do and then says how it went,
 * with the amount and the identifiers on both lines. Two lines rather than one because the
 * interesting failure is the one that produces no second line at all: a request that started a
 * release and then hung, or died mid-transaction, is invisible to outcome-only logging and looks
 * exactly like a request that never arrived.
 *
 * `withMoneyOperation` wraps the work instead of returning a handle to be called later, so the
 * outcome is structural. A caller cannot forget the failure path, because the failure path is not
 * theirs to write — `finally` is not used, deliberately: success and failure carry different fields
 * and different levels, and collapsing them loses the reason.
 */

export const MONEY_OPERATIONS = [
  "payment.initialize",
  "payment.verify",
  "payment.webhook",
  "escrow.hold",
  "escrow.release",
  "escrow.refund",
  "payout.initiate",
] as const;

export type MoneyOperation = (typeof MONEY_OPERATIONS)[number];

/**
 * Identifiers and amounts worth having on the line. All optional: a start line often knows the
 * amount but not yet the row id, and `record` exists to add the id once it does.
 *
 * Amounts are minor units as an integer — kobo, not naira. A float amount in a log is a rounding
 * argument waiting to happen, and this codebase already keeps money in `Prisma.Decimal` for the
 * same reason. `amount` carries the major-unit decimal *as a string* where a caller has only that.
 */
export interface MoneyFields {
  amountMinor?: number;
  amount?: string;
  currency?: string;
  paymentId?: string;
  transactionId?: string;
  escrowId?: string;
  payoutId?: string;
  reference?: string;
  provider?: string;
  /** Whose money it is, where that is not the authenticated caller. */
  subjectUserId?: string;
  [field: string]: unknown;
}

export type MoneyOperationPhase = "start" | "succeeded" | "failed";

/** Emitted as `event: "money.operation"` so a drain can select the ledger out of the log stream. */
export const MONEY_EVENT = "money.operation";

export async function withMoneyOperation<T>(
  logger: LoggerService,
  operation: MoneyOperation,
  fields: MoneyFields,
  run: (record: (extra: MoneyFields) => void) => Promise<T>,
): Promise<T> {
  const collected: MoneyFields = { ...fields };
  const record = (extra: MoneyFields) => Object.assign(collected, extra);
  const startedAt = process.hrtime.bigint();
  const elapsed = () => Number(process.hrtime.bigint() - startedAt) / 1e6;

  const line = (phase: MoneyOperationPhase, extra: Record<string, unknown> = {}) => ({
    msg: `${operation} ${phase}`,
    event: MONEY_EVENT,
    operation,
    phase,
    ...collected,
    ...extra,
  });

  logger.log?.(line("start"));

  try {
    const result = await run(record);
    logger.log?.(line("succeeded", { durationMs: elapsed() }));
    return result;
  } catch (error) {
    // Logged, then rethrown unchanged. This is an observer: swallowing here would turn a failed
    // release into a silent success for the caller.
    logger.error?.(
      line("failed", {
        durationMs: elapsed(),
        errorName: error instanceof Error ? error.name : typeof error,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}
