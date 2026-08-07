import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  ListingStatus,
  PaymentIntent,
  PaymentStatus,
  Prisma,
  TransactionStatus,
  UserRole,
} from "@prisma/client";
import { PaymentsService } from "./payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EscrowService } from "../escrow/escrow.service";
import { PaystackService } from "./paystack.service";
import { GuestCheckoutService } from "../guest-checkout/guest-checkout.service";
import { StandaloneDdService } from "../standalone-dd/standalone-dd.service";
import { TransactionStateService } from "../transactions/transaction-state.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { DD_VERDICT, PURCHASE_BLOCK } from "../transactions/purchase-readiness";
import { KycStatus } from "../kyc/kyc.constants";

/**
 * E1-S4. Buying the property, as opposed to buying the due diligence on it.
 *
 * The database double below keeps real rows in maps rather than answering with canned values,
 * because every criterion in this story is a claim about where a transaction ends up. A double that
 * returned `{ count: 1 }` to everything would pass all of these while the state machine did nothing,
 * and the state service in the providers list is the real one for the same reason.
 */

type Row = Record<string, unknown>;

const buyer = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};
const stranger = { ...buyer, sub: "buyer-2" };

// Twenty five million naira. The deposit this replaces was a tenth of it, so a test that asserts the
// wrong one of the two is off by a factor that would be impossible to miss in the assertion.
const FULL_PRICE = "25000000";
const CALLBACK = "http://localhost:8080/callback";

function buildDb() {
  const transactions = new Map<string, Row>();
  const payments = new Map<string, Row>();
  const listings = new Map<string, Row>();
  const calls: string[] = [];
  let nextPayment = 0;

  function matches(row: Row, where: Row) {
    for (const [key, want] of Object.entries(where)) {
      if (key === "id") continue;
      if (want !== null && typeof want === "object") {
        const clause = want as { in?: unknown[]; not?: unknown };
        if (clause.in && !clause.in.includes(row[key])) return false;
        if ("not" in clause && row[key] === clause.not) return false;
        continue;
      }
      if (row[key] !== want) return false;
    }
    return true;
  }

  const base = {
    calls,
    transactions,
    payments,
    listings,
    transaction: {
      findUnique: jest.fn(async (args: { where: { id: string }; select?: { status?: true } }) => {
        const row = transactions.get(args.where.id);
        if (!row) return null;
        return args.select?.status ? { status: row.status } : row;
      }),
      updateMany: jest.fn(async (args: { where: Row; data: { status: TransactionStatus } }) => {
        calls.push(`transaction.updateMany:${args.data.status}`);
        const row = transactions.get(args.where.id as string);
        if (!row || !matches(row, args.where)) return { count: 0 };
        row.status = args.data.status;
        return { count: 1 };
      }),
    },
    listing: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        return listings.get(args.where.id) ?? null;
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    dueDiligenceOrder: { updateMany: jest.fn(async () => ({ count: 0 })) },
    payment: {
      create: jest.fn(async (args: { data: Row }) => {
        calls.push("payment.create");
        const id = `pay-${++nextPayment}`;
        const row: Row = {
          id,
          listingId: null,
          transactionId: null,
          providerReference: null,
          provider: "paystack",
          currency: "NGN",
          metadata: {},
          createdAt: new Date("2026-03-01T09:00:00.000Z"),
          updatedAt: new Date("2026-03-01T09:00:00.000Z"),
          ...args.data,
          amount: new Prisma.Decimal(String(args.data.amount)),
        };
        payments.set(id, row);
        return row;
      }),
      update: jest.fn(async (args: { where: { id: string }; data: Row }) => {
        const row = payments.get(args.where.id);
        if (row) Object.assign(row, args.data);
        return row;
      }),
      updateMany: jest.fn(async (args: { where: Row; data: Row }) => {
        calls.push("payment.updateMany");
        const row = payments.get(args.where.id as string);
        if (!row || !matches(row, args.where)) return { count: 0 };
        Object.assign(row, args.data);
        return { count: 1 };
      }),
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        return payments.get(args.where.id) ?? null;
      }),
      findUniqueOrThrow: jest.fn(async (args: { where: { id: string } }) => {
        const row = payments.get(args.where.id);
        if (!row) throw new Error("payment not found");
        return row;
      }),
      findFirst: jest.fn(async (args: { where: { providerReference?: string } }) => {
        return (
          [...payments.values()].find(
            (p) => p.providerReference === args.where.providerReference,
          ) ?? null
        );
      }),
    },
    user: {
      findUniqueOrThrow: jest.fn(async () => ({ id: buyer.sub, email: buyer.email })),
    },
  };

  // Attached afterwards so the callback client is the same object rather than a second one. The
  // interactive transaction in the service writes through what it is handed, and a double that
  // handed it a fresh set of maps would show every one of those writes landing nowhere.
  return Object.assign(base, {
    $transaction: jest.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(base)),
  });
}

type Db = ReturnType<typeof buildDb>;

describe("PaymentsService property purchase", () => {
  let service: PaymentsService;
  let db: Db;
  let escrow: { hold: jest.Mock; release: jest.Mock };
  let paystack: {
    isConfigured: jest.Mock;
    publicKey: jest.Mock;
    customerEmail: jest.Mock;
    initializeTransaction: jest.Mock;
    verifyTransaction: jest.Mock;
  };
  let flags: { isEnabled: jest.Mock };

  function seed(
    overrides: {
      status?: TransactionStatus;
      verdict?: string | null;
      kycStatus?: string;
      listingStatus?: ListingStatus;
      price?: string;
    } = {},
  ) {
    const listing: Row = {
      id: "listing-1",
      title: "Plot 4, Lekki",
      sellerId: "seller-1",
      status: overrides.listingStatus ?? ListingStatus.UNDER_OFFER,
      price: new Prisma.Decimal(overrides.price ?? FULL_PRICE),
      currency: "NGN",
    };
    db.listings.set("listing-1", listing);
    db.transactions.set("tx-1", {
      id: "tx-1",
      listingId: "listing-1",
      buyerId: buyer.sub,
      status: overrides.status ?? TransactionStatus.DD_COMPLETE,
      source: "PLATFORM",
      listing,
      dueDiligenceOrder:
        overrides.verdict === undefined
          ? { verdict: DD_VERDICT.PROCEED }
          : { verdict: overrides.verdict },
      buyer: { kycRecord: { status: overrides.kycStatus ?? KycStatus.VERIFIED } },
    });
  }

  function status() {
    return db.transactions.get("tx-1")?.status;
  }

  function start(actor = buyer) {
    return service.startPurchase({ transactionId: "tx-1", callbackUrl: CALLBACK }, actor);
  }

  /** The thrown refusal, so a test can read its status class and its machine-readable code. */
  async function refusalFrom(run: () => Promise<unknown>): Promise<HttpException> {
    try {
      await run();
    } catch (err) {
      return err as HttpException;
    }
    throw new Error("expected the purchase to be refused, and it was not");
  }

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    db = buildDb();
    escrow = { hold: jest.fn(), release: jest.fn() };
    flags = { isEnabled: jest.fn().mockReturnValue(true) };
    paystack = {
      isConfigured: jest.fn().mockReturnValue(true),
      publicKey: jest.fn().mockReturnValue("pk_test"),
      customerEmail: jest.fn().mockReturnValue("buyer+buyer-1@example.com"),
      initializeTransaction: jest.fn(async () => {
        db.calls.push("paystack.initialize");
        return {
          authorizationUrl: "https://checkout.paystack.com/x",
          accessCode: "code",
          reference: "ref_1",
        };
      }),
      verifyTransaction: jest.fn().mockResolvedValue("success"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: db },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn(), createForStaff: jest.fn() },
        },
        {
          provide: EscrowService,
          useValue: {
            hold: jest.fn(async (...args: unknown[]) => {
              db.calls.push("escrow.hold");
              return escrow.hold(...args);
            }),
            release: escrow.release,
          },
        },
        { provide: PaystackService, useValue: paystack },
        { provide: GuestCheckoutService, useValue: { completePayment: jest.fn() } },
        { provide: StandaloneDdService, useValue: { completePayment: jest.fn() } },
        TransactionStateService,
        { provide: FeatureFlagsService, useValue: flags },
      ],
    }).compile();

    service = module.get(PaymentsService);
    seed();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("criterion 2: the transaction moves before the gateway is called", () => {
    it("records that a purchase was started before it asks Paystack for a checkout", async () => {
      await start();

      const moved = db.calls.indexOf(
        `transaction.updateMany:${TransactionStatus.PURCHASE_PENDING}`,
      );
      expect(moved).toBeGreaterThanOrEqual(0);
      expect(moved).toBeLessThan(db.calls.indexOf("payment.create"));
      expect(moved).toBeLessThan(db.calls.indexOf("paystack.initialize"));
    });

    it("leaves an abandoned checkout distinguishable from one that never started", async () => {
      await start();

      // Nothing else in the system says an attempt happened: the payment is PROCESSING and the
      // gateway will never tell us the buyer closed the tab. This status is the whole record of it.
      expect(status()).toBe(TransactionStatus.PURCHASE_PENDING);
      expect(escrow.hold).not.toHaveBeenCalled();
    });

    it("creates the payment against the transaction with a property purchase intent", async () => {
      const result = await start();
      const payment = db.payments.get(result.paymentId) as Row;

      expect(payment.intent).toBe(PaymentIntent.PROPERTY_PURCHASE);
      expect(payment.transactionId).toBe("tx-1");
      expect(payment.listingId).toBe("listing-1");
      expect(payment.payerId).toBe(buyer.sub);
    });

    it("gives a buyer who closed the tab their checkout back", async () => {
      seed({ status: TransactionStatus.PURCHASE_PENDING });

      await expect(start()).resolves.toEqual(expect.objectContaining({ reference: "ref_1" }));
      expect(status()).toBe(TransactionStatus.PURCHASE_PENDING);
    });

    it("does not drag the transaction backwards through the due diligence move", async () => {
      // `initiatePayment` still carries the INITIATED to IN_PROGRESS update every payment runs. It
      // is conditional on INITIATED, which is why a purchase does not undo the move above.
      await start();

      expect(status()).toBe(TransactionStatus.PURCHASE_PENDING);
    });
  });

  describe("criterion 3: the full price, held in escrow", () => {
    it("charges the listing price rather than a deposit", async () => {
      const result = await start();

      expect(paystack.initializeTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinor: 2_500_000_000, currency: "NGN" }),
      );
      expect((db.payments.get(result.paymentId) as Row).amount?.toString()).toBe(FULL_PRICE);
    });

    it("refuses a property with no price, before it moves anything", async () => {
      seed({ price: "0" });

      await expect(start()).rejects.toBeInstanceOf(BadRequestException);
      expect(status()).toBe(TransactionStatus.DD_COMPLETE);
      expect(db.payment.create).not.toHaveBeenCalled();
    });

    it("moves the transaction into escrow and holds the whole amount when the charge succeeds", async () => {
      paystack.isConfigured.mockReturnValue(false);

      const result = await start();

      expect(status()).toBe(TransactionStatus.PURCHASE_IN_ESCROW);
      expect(escrow.hold).toHaveBeenCalledTimes(1);
      const [transactionId, amount] = escrow.hold.mock.calls[0];
      expect(transactionId).toBe("tx-1");
      expect(amount.toString()).toBe(FULL_PRICE);
      expect((db.payments.get(result.paymentId) as Row).status).toBe(PaymentStatus.SUCCEEDED);
    });

    it("moves the transaction inside the same unit of work as the payment claim, and holds after", async () => {
      paystack.isConfigured.mockReturnValue(false);

      await start();

      expect(db.$transaction).toHaveBeenCalled();
      const moved = db.calls.indexOf(
        `transaction.updateMany:${TransactionStatus.PURCHASE_IN_ESCROW}`,
      );
      // The hold is outside the transaction, so it must not run until the move has committed.
      // Reversed, a rolled back move would leave money held against a transaction still pending.
      expect(moved).toBeLessThan(db.calls.indexOf("escrow.hold"));
    });

    it("will not put fresh money against a purchase that has already closed", async () => {
      // The state machine refuses COMPLETED, where the loose update this replaced matched nothing
      // and let the hold run anyway. Postgres rolls the claim back with the refusal; what is
      // asserted here is ours, which is that no money was placed.
      seed({ status: TransactionStatus.COMPLETED });
      const payment = {
        id: "pay-late",
        transactionId: "tx-1",
        payerId: buyer.sub,
        amount: new Prisma.Decimal(FULL_PRICE),
        currency: "NGN",
        provider: "paystack",
        providerReference: "ref_late",
        status: PaymentStatus.PROCESSING,
        intent: PaymentIntent.PROPERTY_PURCHASE,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.payments.set(payment.id, payment);

      await expect(
        service.handlePaystackWebhook({
          event: "charge.success",
          data: {
            reference: "ref_late",
            status: "success",
            paid_at: new Date(Date.now() - 60_000).toISOString(),
          },
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(escrow.hold).not.toHaveBeenCalled();
      expect(status()).toBe(TransactionStatus.COMPLETED);
    });
  });

  describe("criterion 4: a purchase that does not complete leaves nothing behind", () => {
    it("returns the transaction when the gateway will not open a checkout", async () => {
      paystack.initializeTransaction.mockRejectedValue(new Error("Paystack initialize failed"));

      await expect(start()).rejects.toBeInstanceOf(BadRequestException);
      expect(status()).toBe(TransactionStatus.DD_COMPLETE);
      expect(escrow.hold).not.toHaveBeenCalled();
    });

    it("returns the transaction when the card is declined at verify", async () => {
      const { paymentId } = await start();
      paystack.verifyTransaction.mockResolvedValue("failed");

      await service.verifyTransaction(paymentId, buyer);

      expect(status()).toBe(TransactionStatus.DD_COMPLETE);
      expect((db.payments.get(paymentId) as Row).status).toBe(PaymentStatus.FAILED);
      expect(escrow.hold).not.toHaveBeenCalled();
    });

    it("returns the transaction on a charge.failed delivery", async () => {
      await start();

      await service.handlePaystackWebhook({
        event: "charge.failed",
        data: {
          reference: "ref_1",
          status: "failed",
          paid_at: new Date(Date.now() - 60_000).toISOString(),
        },
      });

      expect(status()).toBe(TransactionStatus.DD_COMPLETE);
      expect(escrow.hold).not.toHaveBeenCalled();
    });

    it("returns the transaction when the buyer closes the checkout window", async () => {
      const { paymentId } = await start();

      const abandoned = await service.abandonPayment(paymentId, buyer);

      expect(abandoned.status).toBe(PaymentStatus.FAILED);
      expect(status()).toBe(TransactionStatus.DD_COMPLETE);
      expect(escrow.hold).not.toHaveBeenCalled();
    });

    it("lets the money win the race against a buyer closing the window a moment later", async () => {
      paystack.isConfigured.mockReturnValue(false);
      const { paymentId } = await start();

      const abandoned = await service.abandonPayment(paymentId, buyer);

      expect(abandoned.status).toBe(PaymentStatus.SUCCEEDED);
      expect(status()).toBe(TransactionStatus.PURCHASE_IN_ESCROW);
      expect(escrow.hold).toHaveBeenCalledTimes(1);
    });

    it("refuses to abandon anything that is not a property purchase", async () => {
      seed({ status: TransactionStatus.INITIATED });
      const dd = await service.initiate(
        { amount: 250_000, transactionId: "tx-1", callbackUrl: CALLBACK },
        buyer,
      );

      await expect(service.abandonPayment(dd.paymentId, buyer)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(status()).toBe(TransactionStatus.IN_PROGRESS);
    });

    it("will not let a stranger walk somebody else's purchase out of checkout", async () => {
      const { paymentId } = await start();

      await expect(service.abandonPayment(paymentId, stranger)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(status()).toBe(TransactionStatus.PURCHASE_PENDING);
    });

    it("answers 404 for a payment that does not exist", async () => {
      await expect(service.abandonPayment("pay-nope", buyer)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("criterion 6, and the rest of the refusals", () => {
    it("blocks a verdict of do not proceed and says so", async () => {
      seed({ verdict: DD_VERDICT.DO_NOT_PROCEED });

      const err = await refusalFrom(start);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({
        blockedBy: PURCHASE_BLOCK.VERDICT_AGAINST,
        message: expect.stringMatching(/do not proceed/i),
      });
      expect(status()).toBe(TransactionStatus.DD_COMPLETE);
    });

    it("lets a caution through, because it is the buyer's decision to weigh", async () => {
      seed({ verdict: DD_VERDICT.PROCEED_WITH_CAUTION });

      await expect(start()).resolves.toEqual(expect.objectContaining({ reference: "ref_1" }));
    });

    it("blocks a buyer whose identity is not verified", async () => {
      seed({ kycStatus: KycStatus.SUBMITTED });

      const err = await refusalFrom(start);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({ blockedBy: PURCHASE_BLOCK.KYC_REQUIRED });
    });

    it("does not confirm the step exists while the flag is dark", async () => {
      flags.isEnabled.mockReturnValue(false);

      const err = await refusalFrom(start);

      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.getResponse()).toMatchObject({ blockedBy: PURCHASE_BLOCK.FEATURE_OFF });
    });

    it("answers 409 to a transaction that is somewhere else entirely", async () => {
      seed({ status: TransactionStatus.DD_IN_PROGRESS });

      const err = await refusalFrom(start);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({
        blockedBy: PURCHASE_BLOCK.DUE_DILIGENCE_UNFINISHED,
      });
    });

    it("answers 409 rather than taking a second payment for money already held", async () => {
      seed({ status: TransactionStatus.PURCHASE_IN_ESCROW });

      const err = await refusalFrom(start);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ blockedBy: PURCHASE_BLOCK.ALREADY_IN_ESCROW });
      expect(escrow.hold).not.toHaveBeenCalled();
    });

    it("writes nothing at all on any refusal", async () => {
      for (const scenario of [
        { verdict: DD_VERDICT.DO_NOT_PROCEED },
        { kycStatus: KycStatus.REJECTED },
        { status: TransactionStatus.DD_PURCHASED },
        { status: TransactionStatus.COMPLETED },
      ]) {
        seed(scenario);
        const before = status();

        await refusalFrom(start);

        expect(status()).toBe(before);
        expect(db.payment.create).not.toHaveBeenCalled();
        expect(paystack.initializeTransaction).not.toHaveBeenCalled();
      }
    });

    it("answers 404 for a transaction that does not exist and 403 for one that is not theirs", async () => {
      await expect(
        service.startPurchase({ transactionId: "tx-nope", callbackUrl: CALLBACK }, buyer),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(start(stranger)).rejects.toBeInstanceOf(ForbiddenException);
      expect(status()).toBe(TransactionStatus.DD_COMPLETE);
    });
  });

  describe("the listing a purchase is against is not a live one", () => {
    it("buys a property that is under offer, which is where due diligence left it", async () => {
      // The trap this closes: paying for due diligence takes the listing to UNDER_OFFER, so a live
      // only rule would shut out the one buyer entitled to complete the purchase.
      seed({ listingStatus: ListingStatus.UNDER_OFFER });

      await expect(start()).resolves.toEqual(expect.objectContaining({ reference: "ref_1" }));
    });

    it("still holds due diligence payments to live listings", async () => {
      seed({ status: TransactionStatus.INITIATED, listingStatus: ListingStatus.UNDER_OFFER });

      await expect(
        service.initiate({ amount: 250_000, listingId: "listing-1", callbackUrl: CALLBACK }, buyer),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
