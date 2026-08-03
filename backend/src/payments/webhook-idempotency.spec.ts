import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PaymentStatus, PaymentIntent, Prisma, TransactionStatus } from "@prisma/client";
import { PaymentsService } from "./payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EscrowService } from "../escrow/escrow.service";
import { PaystackService } from "./paystack.service";
import { GuestCheckoutService } from "../guest-checkout/guest-checkout.service";
import { StandaloneDdService } from "../standalone-dd/standalone-dd.service";
import { TransactionStateService } from "../transactions/transaction-state.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { assessFreshness, claimPaymentForSuccess, webhookMaxAgeMs } from "./webhook-idempotency";

/**
 * E2-S2. The unit tests below cover the two guards in isolation; the service tests cover what the
 * story is actually about, which is that a second delivery of the same event changes nothing.
 */

describe("webhookMaxAgeMs", () => {
  it("defaults to 24 hours when unset", () => {
    expect(webhookMaxAgeMs({} as NodeJS.ProcessEnv)).toBe(24 * 60 * 60_000);
  });

  it("reads the configured window in minutes", () => {
    expect(webhookMaxAgeMs({ PAYMENT_WEBHOOK_MAX_AGE_MINUTES: "30" } as NodeJS.ProcessEnv)).toBe(
      30 * 60_000,
    );
  });

  // A typo in an env var must not take the payment webhook offline: every buyer who pays while it
  // is wrong would be stranded PENDING, which is worse than the window being wider than intended.
  it.each(["", "   ", "abc", "0", "-5", "NaN"])("falls back to the default for %p", (raw) => {
    expect(webhookMaxAgeMs({ PAYMENT_WEBHOOK_MAX_AGE_MINUTES: raw } as NodeJS.ProcessEnv)).toBe(
      24 * 60 * 60_000,
    );
  });
});

describe("assessFreshness", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  const oneHour = 60 * 60_000;

  it("accepts an event inside the window", () => {
    const verdict = assessFreshness({ paid_at: "2026-03-01T11:30:00.000Z" }, now, oneHour);

    expect(verdict).toMatchObject({ fresh: true, reason: "fresh", ageMs: 30 * 60_000 });
  });

  it("refuses an event older than the window", () => {
    const verdict = assessFreshness({ paid_at: "2026-02-27T12:00:00.000Z" }, now, oneHour);

    expect(verdict.fresh).toBe(false);
    expect(verdict.reason).toBe("stale");
  });

  it("refuses an event dated well into the future", () => {
    const verdict = assessFreshness({ paid_at: "2026-03-01T13:00:00.000Z" }, now, oneHour);

    expect(verdict.fresh).toBe(false);
    expect(verdict.reason).toBe("future");
  });

  // Our clock and the gateway's are not the same clock. A couple of minutes of skew is normal and
  // must not look like a forged payload.
  it("tolerates a few minutes of clock skew", () => {
    const verdict = assessFreshness({ paid_at: "2026-03-01T12:02:00.000Z" }, now, oneHour);

    expect(verdict.fresh).toBe(true);
  });

  it("prefers paid_at over created_at, because it is when the money moved", () => {
    const verdict = assessFreshness(
      { paid_at: "2026-03-01T11:59:00.000Z", created_at: "2026-01-01T00:00:00.000Z" },
      now,
      oneHour,
    );

    expect(verdict).toMatchObject({ fresh: true, eventAt: "2026-03-01T11:59:00.000Z" });
  });

  it("falls back to created_at when the event never paid", () => {
    const verdict = assessFreshness({ created_at: "2026-03-01T11:59:00.000Z" }, now, oneHour);

    expect(verdict.eventAt).toBe("2026-03-01T11:59:00.000Z");
  });

  // Applied, not refused. A provider that dates its events differently would otherwise stop
  // working silently, and the claim already makes a duplicate harmless.
  it("applies an event it cannot date, and says so", () => {
    expect(assessFreshness(undefined, now, oneHour)).toMatchObject({
      fresh: true,
      reason: "undated",
    });
    expect(assessFreshness({ paid_at: "last tuesday" }, now, oneHour)).toMatchObject({
      fresh: true,
      reason: "unparseable",
    });
    expect(assessFreshness({ paid_at: 1740830400 }, now, oneHour)).toMatchObject({
      fresh: true,
      reason: "undated",
    });
  });
});

describe("claimPaymentForSuccess", () => {
  it("claims a pending payment and reports the win", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });

    await expect(claimPaymentForSuccess({ payment: { updateMany } }, "pay-1")).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: { not: PaymentStatus.SUCCEEDED } },
      data: { status: PaymentStatus.SUCCEEDED },
    });
  });

  it("reports the loss when the row no longer matches", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });

    await expect(claimPaymentForSuccess({ payment: { updateMany } }, "pay-1")).resolves.toBe(false);
  });
});

/**
 * A Prisma stand-in with one property the plain jest.fn() mocks in payments.service.spec.ts do not
 * have: `payment.updateMany` is serialised per call and yields to the event loop inside the
 * critical section.
 *
 * That models the row lock Postgres takes for `UPDATE ... WHERE id = $1 AND status <> 'SUCCEEDED'`,
 * which is the database's guarantee rather than ours. What the concurrency test below then proves
 * is the half that IS ours: that every side effect hangs off the claim's verdict. Delete the
 * `if (!applied) return false;` gate in applyPaymentChargeSuccess and the test fails with two
 * escrow holds, which is precisely the production bug.
 */
class FakePayments {
  private readonly rows = new Map<string, Record<string, unknown>>();
  private lock: Promise<unknown> = Promise.resolve();

  constructor(rows: Array<Record<string, unknown>>) {
    for (const row of rows) this.rows.set(row.id as string, { ...row });
  }

  row(id: string) {
    return this.rows.get(id);
  }

  findUnique = jest.fn(async ({ where }: { where: { id: string } }) => this.rows.get(where.id));

  findFirst = jest.fn(async ({ where }: { where: { providerReference?: string } }) =>
    [...this.rows.values()].find((r) => r.providerReference === where.providerReference),
  );

  findUniqueOrThrow = jest.fn(async ({ where }: { where: { id: string } }) => {
    const row = this.rows.get(where.id);
    if (!row) throw new Error("not found");
    return row;
  });

  update = jest.fn(async ({ where, data }: { where: { id: string }; data: object }) => {
    const row = this.rows.get(where.id);
    if (row) Object.assign(row, data);
    return row;
  });

  updateMany = jest.fn(
    (args: { where: { id: string; status?: { not?: PaymentStatus } }; data: object }) =>
      this.serialised(async () => {
        const row = this.rows.get(args.where.id);
        // The yield is the point. Both deliveries are in flight across it, so a claim written as
        // read-then-write in our own code would let both through.
        await Promise.resolve();
        if (!row) return { count: 0 };
        if (args.where.status?.not !== undefined && row.status === args.where.status.not) {
          return { count: 0 };
        }
        Object.assign(row, args.data);
        return { count: 1 };
      }),
  );

  private serialised<T>(work: () => Promise<T>): Promise<T> {
    const next = this.lock.then(work, work);
    this.lock = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

describe("PaymentsService webhook idempotency", () => {
  let service: PaymentsService;
  let payments: FakePayments;
  let escrow: { hold: jest.Mock; release: jest.Mock };
  let notifications: { create: jest.Mock; createForStaff: jest.Mock };
  let guestCheckout: { completePayment: jest.Mock };
  let warn: jest.SpyInstance;

  const paidAt = () => new Date(Date.now() - 60_000).toISOString();

  function paymentRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "pay-1",
      listingId: null,
      transactionId: "tx-1",
      payerId: "buyer-1",
      amount: new Prisma.Decimal("5000"),
      currency: "NGN",
      provider: "paystack",
      providerReference: "ref_1",
      status: PaymentStatus.PENDING,
      intent: PaymentIntent.PROPERTY_PURCHASE,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function chargeSuccess(extra: Record<string, unknown> = {}) {
    return {
      event: "charge.success",
      data: { reference: "ref_1", status: "success", paid_at: paidAt(), ...extra },
    };
  }

  async function build(rows: Array<Record<string, unknown>>) {
    payments = new FakePayments(rows);
    escrow = { hold: jest.fn(), release: jest.fn() };
    notifications = { create: jest.fn(), createForStaff: jest.fn() };
    guestCheckout = { completePayment: jest.fn() };

    const txClient = {
      payment: payments,
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ listingId: "listing-1", source: "PLATFORM" }),
      },
      listing: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      dueDiligenceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    const prisma = {
      payment: payments,
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: "tx-1",
          buyerId: "buyer-1",
          listing: { id: "listing-1", title: "Plot 4", sellerId: "seller-1" },
          buyer: { id: "buyer-1" },
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txClient)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: EscrowService, useValue: escrow },
        { provide: PaystackService, useValue: { isConfigured: jest.fn().mockReturnValue(true) } },
        { provide: GuestCheckoutService, useValue: guestCheckout },
        { provide: StandaloneDdService, useValue: { completePayment: jest.fn() } },
        // E1-S4. The real state service, because the purchase move is now its job and a stub here
        // would let a duplicate delivery move a transaction the second time round.
        TransactionStateService,
        { provide: FeatureFlagsService, useValue: { isEnabled: () => true } },
      ],
    }).compile();

    service = module.get(PaymentsService);
  }

  beforeEach(async () => {
    // On the prototype, not the instance: build() constructs a fresh service in several tests and
    // the suspicious line is what criterion 3 asks us to prove was written.
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    await build([paymentRow()]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Criterion 2.
  it("acknowledges a duplicate charge.success with 200 and performs no side effect", async () => {
    await expect(service.handlePaystackWebhook(chargeSuccess())).resolves.toEqual({
      received: true,
    });
    expect(escrow.hold).toHaveBeenCalledTimes(1);

    await expect(service.handlePaystackWebhook(chargeSuccess())).resolves.toEqual({
      received: true,
    });

    expect(escrow.hold).toHaveBeenCalledTimes(1);
    expect(payments.row("pay-1")?.status).toBe(PaymentStatus.SUCCEEDED);
  });

  // Criterion 5, on the intent that holds money.
  it("fires the same event twice in parallel and holds escrow exactly once", async () => {
    const [a, b] = await Promise.all([
      service.handlePaystackWebhook(chargeSuccess()),
      service.handlePaystackWebhook(chargeSuccess()),
    ]);

    expect(a).toEqual({ received: true });
    expect(b).toEqual({ received: true });
    expect(escrow.hold).toHaveBeenCalledTimes(1);
    expect(escrow.hold).toHaveBeenCalledWith("tx-1", new Prisma.Decimal("5000"));
    // One status change: the second claim matched nothing, so it never wrote.
    expect(payments.updateMany.mock.results).toHaveLength(2);
    expect(payments.row("pay-1")?.status).toBe(PaymentStatus.SUCCEEDED);
  });

  // Criterion 5, on the intent that notifies.
  it("fires the same event twice in parallel and sends one notification set", async () => {
    await build([paymentRow({ intent: PaymentIntent.DD_SERVICE })]);

    await Promise.all([
      service.handlePaystackWebhook(chargeSuccess()),
      service.handlePaystackWebhook(chargeSuccess()),
    ]);
    // notifyDdPaymentSucceeded is deliberately fire-and-forget, so let its microtasks drain.
    await new Promise((resolve) => setImmediate(resolve));

    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(notifications.createForStaff).toHaveBeenCalledTimes(1);
    expect(escrow.hold).not.toHaveBeenCalled();
  });

  it("completes a guest checkout once across two deliveries", async () => {
    await build([paymentRow({ metadata: { guestCheckout: true }, transactionId: null })]);

    await Promise.all([
      service.handlePaystackWebhook(chargeSuccess()),
      service.handlePaystackWebhook(chargeSuccess()),
    ]);

    expect(guestCheckout.completePayment).toHaveBeenCalledTimes(1);
  });

  // Criterion 3.
  it("refuses an event older than the window and logs it as suspicious", async () => {
    const stale = chargeSuccess({ paid_at: new Date(Date.now() - 40 * 60 * 60_000).toISOString() });

    await expect(service.handlePaystackWebhook(stale)).resolves.toEqual({ received: true });

    expect(escrow.hold).not.toHaveBeenCalled();
    expect(payments.row("pay-1")?.status).toBe(PaymentStatus.PENDING);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("suspicious paystack webhook"));
  });

  it("refuses an event dated in the future", async () => {
    const ahead = chargeSuccess({ paid_at: new Date(Date.now() + 60 * 60_000).toISOString() });

    await service.handlePaystackWebhook(ahead);

    expect(payments.row("pay-1")?.status).toBe(PaymentStatus.PENDING);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("future"));
  });

  it("honours a narrowed window from the environment", async () => {
    const previous = process.env.PAYMENT_WEBHOOK_MAX_AGE_MINUTES;
    process.env.PAYMENT_WEBHOOK_MAX_AGE_MINUTES = "5";
    try {
      const old = chargeSuccess({ paid_at: new Date(Date.now() - 10 * 60_000).toISOString() });

      await service.handlePaystackWebhook(old);

      expect(payments.row("pay-1")?.status).toBe(PaymentStatus.PENDING);
    } finally {
      if (previous === undefined) delete process.env.PAYMENT_WEBHOOK_MAX_AGE_MINUTES;
      else process.env.PAYMENT_WEBHOOK_MAX_AGE_MINUTES = previous;
    }
  });

  // A replayed failure is the one that moves money backwards: escrow already holds against a
  // transaction whose payment row would read FAILED.
  it("does not let a late charge.failed overwrite a succeeded payment", async () => {
    await service.handlePaystackWebhook(chargeSuccess());
    expect(payments.row("pay-1")?.status).toBe(PaymentStatus.SUCCEEDED);

    await service.handlePaystackWebhook({
      event: "charge.failed",
      data: { reference: "ref_1", status: "failed", paid_at: paidAt() },
    });

    expect(payments.row("pay-1")?.status).toBe(PaymentStatus.SUCCEEDED);
  });

  // Criterion 6. A 4xx here means the gateway retries an event we can never match, forever.
  it("acknowledges an unknown reference with 200 and no side effect", async () => {
    await expect(
      service.handlePaystackWebhook({
        event: "charge.success",
        data: { reference: "ref_nobody", status: "success", paid_at: paidAt() },
      }),
    ).resolves.toEqual({ received: true });

    expect(escrow.hold).not.toHaveBeenCalled();
    expect(payments.row("pay-1")?.status).toBe(PaymentStatus.PENDING);
  });

  it("acknowledges a body with no reference at all", async () => {
    await expect(service.handlePaystackWebhook({ event: "charge.success" })).resolves.toEqual({
      received: true,
    });
  });

  // Criterion 4, from the other entry point: the browser returning from Paystack races the
  // gateway's own delivery, and both call into applyPaymentChargeSuccess.
  it("does not double-apply when verify and the webhook race", async () => {
    const actor = { sub: "buyer-1", email: "b@x.test", role: "BUYER", professionalType: null };
    const paystack = service["paystack"] as unknown as { verifyTransaction: jest.Mock };
    paystack.verifyTransaction = jest.fn().mockResolvedValue("success");

    await Promise.all([
      service.handlePaystackWebhook(chargeSuccess()),
      service.verifyTransaction("pay-1", actor as never),
    ]);

    expect(escrow.hold).toHaveBeenCalledTimes(1);
  });

  it("leaves an unrelated event alone", async () => {
    await service.handlePaystackWebhook({
      event: "transfer.success",
      data: { reference: "ref_1", status: "success", paid_at: paidAt() },
    });

    expect(payments.row("pay-1")?.status).toBe(PaymentStatus.PENDING);
    expect(escrow.hold).not.toHaveBeenCalled();
  });

  it("ignores a stale replay of an event that would otherwise be a duplicate", async () => {
    await service.handlePaystackWebhook(chargeSuccess());
    warn.mockClear();

    await service.handlePaystackWebhook(
      chargeSuccess({ paid_at: new Date(Date.now() - 40 * 60 * 60_000).toISOString() }),
    );

    expect(escrow.hold).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
