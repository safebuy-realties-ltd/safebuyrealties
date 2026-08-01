import { PaymentStatus } from "@prisma/client";

/**
 * E2-S2. A gateway retries. Paystack re-delivers `charge.success` when our 200 is slow, lost, or
 * arrives after its timeout, and a captured payload can be posted back deliberately. Before this
 * file, the second delivery re-ran everything the first did: another escrow hold, another
 * notification set, another guest-checkout completion.
 *
 * Two guards, and it matters which one is load-bearing.
 *
 * The one that carries the weight is `claimPaymentForSuccess`, a conditional update on the payment
 * row that exactly one caller can win. Freshness is defence in depth, deliberately generous, and is
 * never the only thing between a replay and a second escrow hold.
 *
 * What is NOT here is criterion 1's `ProcessedWebhookEvent` table, which would record provider,
 * event id and processed timestamp under a unique constraint. That is a Prisma migration against a
 * shared cloud database, which this repository's working agreement forbids a story from doing. The
 * claim below gives the same exactly-once guarantee for the *effect*; the table would add
 * observability and dedup across events that target different rows. See the PR for what unblocking
 * it needs.
 */

/** How old an event may be before it is treated as a replay rather than a retry. */
const DEFAULT_MAX_AGE_MINUTES = 24 * 60;

/**
 * Clocks disagree. A few minutes into the future is a normal skew between our host and Paystack's;
 * an hour is not, and is the shape of a hand-edited payload.
 */
const FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * The timestamp fields a gateway may carry. Paystack sends `paid_at` and `created_at` on
 * `charge.success`; the camelCase spellings are accepted because a payload that has been through a
 * proxy or a test fixture may carry either.
 */
export interface WebhookTiming {
  readonly paid_at?: unknown;
  readonly paidAt?: unknown;
  readonly created_at?: unknown;
  readonly createdAt?: unknown;
}

export type FreshnessReason = "fresh" | "stale" | "future" | "undated" | "unparseable";

export interface FreshnessVerdict {
  /** Whether the event may be applied. Only `stale` and `future` refuse. */
  readonly fresh: boolean;
  readonly reason: FreshnessReason;
  /** Present when a timestamp was read and understood. Milliseconds; negative means the future. */
  readonly ageMs?: number;
  /** The timestamp as the gateway sent it, for the log line. */
  readonly eventAt?: string;
}

/**
 * Reads the configured window. Invalid or absent configuration falls back to the default rather
 * than throwing: a malformed env var must not take the payment webhook offline, which would strand
 * every buyer who paid while it was wrong.
 */
export function webhookMaxAgeMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PAYMENT_WEBHOOK_MAX_AGE_MINUTES;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_AGE_MINUTES * 60_000;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return DEFAULT_MAX_AGE_MINUTES * 60_000;
  return minutes * 60_000;
}

function readTimestamp(timing: WebhookTiming | undefined): string | undefined {
  if (!timing) return undefined;
  // `paid_at` first: it is when the money moved, which is what "how old is this event" means here.
  for (const value of [timing.paid_at, timing.paidAt, timing.created_at, timing.createdAt]) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return undefined;
}

/**
 * Decides whether an event is recent enough to act on.
 *
 * The window is a day by default, and that is a deliberate choice rather than a loose one. A
 * gateway retries a failed delivery for a long time, and refusing a legitimate retry is the more
 * expensive error of the two: it leaves a payment `PENDING` that the buyer has already made, with
 * no escrow hold and no notification, and nothing else in the system will ever fix it. A replay
 * that gets past this check still meets the claim, which is where exactly-once actually lives.
 *
 * An event with no timestamp, or one this cannot parse, is applied and reported. Refusing it would
 * mean a provider that dates its events differently silently stops working, and the claim already
 * makes a duplicate harmless.
 */
export function assessFreshness(
  timing: WebhookTiming | undefined,
  now: Date,
  maxAgeMs: number,
): FreshnessVerdict {
  const eventAt = readTimestamp(timing);
  if (eventAt === undefined) return { fresh: true, reason: "undated" };

  const parsed = Date.parse(eventAt);
  if (Number.isNaN(parsed)) return { fresh: true, reason: "unparseable", eventAt };

  const ageMs = now.getTime() - parsed;
  if (ageMs < -FUTURE_SKEW_TOLERANCE_MS) return { fresh: false, reason: "future", ageMs, eventAt };
  if (ageMs > maxAgeMs) return { fresh: false, reason: "stale", ageMs, eventAt };
  return { fresh: true, reason: "fresh", ageMs, eventAt };
}

/** The subset of a Prisma client or transaction this needs, so a caller can pass either. */
export interface PaymentClaimClient {
  payment: {
    updateMany(args: {
      where: { id: string; status: { not: PaymentStatus } };
      data: { status: PaymentStatus };
    }): Promise<{ count: number }>;
  };
}

/**
 * Moves a payment to SUCCEEDED, and reports whether this caller is the one that moved it.
 *
 * This is the whole idempotency guarantee, and it rests on a property of the database rather than
 * on a check in application code. `UPDATE payment SET status = 'SUCCEEDED' WHERE id = $1 AND status
 * <> 'SUCCEEDED'` takes a row lock. Two concurrent deliveries of the same event contend for that
 * one row: the second blocks until the first commits, then re-evaluates its WHERE clause against
 * the committed row and matches nothing. Exactly one of them sees `count === 1`.
 *
 * Read-then-write cannot do this. `if (payment.status === SUCCEEDED) return`, which is what
 * criterion 4 literally asks for, leaves a window between the read and the write in which the other
 * delivery does the same read, and both proceed. That window is small and it is exactly the one a
 * retry storm lands in.
 *
 * Pass the transaction client, not the base client, wherever the side effects are transactional.
 * The claim then commits or rolls back with them, so a failure releases it and the gateway's next
 * retry can legitimately re-apply the payment instead of finding it already marked done.
 */
export async function claimPaymentForSuccess(
  client: PaymentClaimClient,
  paymentId: string,
): Promise<boolean> {
  const claimed = await client.payment.updateMany({
    where: { id: paymentId, status: { not: PaymentStatus.SUCCEEDED } },
    data: { status: PaymentStatus.SUCCEEDED },
  });
  return claimed.count > 0;
}
