import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ListingStatus, TransactionStatus, Prisma } from "@prisma/client";
import { EscrowService } from "./escrow.service";
import { PaystackService } from "../payments/paystack.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notification-types.constants";
import { ESCROW_STATUS, PAYOUT_STATUS, PLATFORM_FEE_RATE } from "./escrow.constants";

const transactionId = "tx-1";
const listingId = "listing-1";
const sellerId = "seller-1";

function makeEscrow(overrides: Record<string, unknown> = {}) {
  return {
    id: "escrow-1",
    transactionId,
    status: ESCROW_STATUS.HELD,
    heldAmount: new Prisma.Decimal("1000000"),
    releaseConditions: [],
    conditionsMet: [],
    heldAt: new Date(),
    releasedAt: null,
    refundedAt: null,
    releasedById: null,
    releaseNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    transaction: {
      id: transactionId,
      status: TransactionStatus.PURCHASE_IN_ESCROW,
      buyerId: "buyer-1",
      listingId,
      listing: { id: listingId, title: "Test Villa", sellerId, status: ListingStatus.UNDER_OFFER },
      buyer: { id: "buyer-1", firstName: "Jane", lastName: "Buyer", email: "buyer@test.com" },
    },
    ...overrides,
  };
}

describe("EscrowService", () => {
  let service: EscrowService;
  let prisma: Record<string, unknown>;
  let notifications: { create: jest.Mock };
  let paystack: { isConfigured: jest.Mock; createTransfer: jest.Mock };

  beforeEach(async () => {
    notifications = { create: jest.fn() };
    paystack = { isConfigured: jest.fn().mockReturnValue(false), createTransfer: jest.fn() };
    prisma = {
      transaction: { findUnique: jest.fn(), update: jest.fn() },
      escrow: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      listing: { update: jest.fn(), updateMany: jest.fn() },
      payout: { findFirst: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscrowService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: NotificationsService, useValue: notifications },
        { provide: PaystackService, useValue: paystack },
      ],
    }).compile();

    service = module.get(EscrowService);
  });

  it("hold upserts escrow as HELD", async () => {
    (prisma.transaction as { findUnique: jest.Mock }).findUnique
      .mockResolvedValueOnce({ id: transactionId, listing: { id: listingId } })
      .mockResolvedValueOnce({
        id: transactionId,
        status: TransactionStatus.PURCHASE_IN_ESCROW,
        listing: { status: ListingStatus.UNDER_OFFER },
        powerOfAttorney: { id: "poa-1" },
      });
    (prisma.escrow as { upsert: jest.Mock }).upsert.mockResolvedValue(makeEscrow());

    const result = await service.hold(transactionId, "1000000");
    expect(result.status).toBe(ESCROW_STATUS.HELD);
  });

  it("release creates payout with 5% fee when conditions met", async () => {
    (prisma.transaction as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
      id: transactionId,
      status: TransactionStatus.PURCHASE_IN_ESCROW,
      listing: { status: ListingStatus.UNDER_OFFER },
      powerOfAttorney: { id: "poa-1" },
    });
    (prisma.escrow as { findUnique: jest.Mock }).findUnique
      .mockResolvedValueOnce(makeEscrow())
      .mockResolvedValueOnce({
        ...makeEscrow(),
        transaction: { ...makeEscrow().transaction, listing: { ...makeEscrow().transaction.listing, sellerId } },
      });
    (prisma.escrow as { update: jest.Mock }).update.mockResolvedValue(makeEscrow({ status: ESCROW_STATUS.RELEASED }));
    (prisma.payout as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);
    (prisma.payout as { create: jest.Mock }).create.mockResolvedValue({
      id: "payout-1",
      transactionId,
      sellerId,
      grossAmount: new Prisma.Decimal("1000000"),
      platformFee: new Prisma.Decimal("50000"),
      netAmount: new Prisma.Decimal("950000"),
      status: PAYOUT_STATUS.COMPLETED,
      gatewayReference: "mock",
      initiatedAt: new Date(),
      completedAt: new Date(),
    });

    const result = await service.release(transactionId, "staff-1");
    expect(result.payout.platformFee).toBe(String(1_000_000 * PLATFORM_FEE_RATE));
    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "buyer-1",
        type: NotificationType.ESCROW_RELEASED,
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: sellerId,
        type: NotificationType.ESCROW_RELEASED,
      }),
    );
  });

  describe("payouts are identifiable as mock", () => {
    beforeEach(() => {
      (prisma.escrow as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
        ...makeEscrow(),
        transaction: { ...makeEscrow().transaction, listing: { id: listingId, sellerId } },
      });
      (prisma.payout as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);
      // Echo the row back so the assertion sees what the service actually wrote.
      (prisma.payout as { create: jest.Mock }).create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({ id: "payout-1", ...data }),
      );
      (prisma.user as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
        firstName: "Sam",
        lastName: "Seller",
      });
    });

    it("flags a mock payout, which is COMPLETED without money moving", async () => {
      paystack.isConfigured.mockReturnValue(false);

      const payout = await service.initiatePayout(transactionId);

      expect(payout.status).toBe(PAYOUT_STATUS.COMPLETED);
      expect(payout.gatewayReference).toMatch(/^mock_/);
      expect(payout.isMock).toBe(true);
      expect(paystack.createTransfer).not.toHaveBeenCalled();
    });

    it("does not flag a live Paystack payout", async () => {
      paystack.isConfigured.mockReturnValue(true);
      paystack.createTransfer.mockResolvedValue({
        transferCode: "TRF_1",
        reference: "sbr_payout_tx-1",
        status: "success",
      });

      const payout = await service.initiatePayout(transactionId);

      expect(payout.gatewayReference).toBe("sbr_payout_tx-1");
      expect(payout.isMock).toBe(false);
    });

    it("does not flag a failed live transfer as mock", async () => {
      paystack.isConfigured.mockReturnValue(true);
      paystack.createTransfer.mockRejectedValue(new Error("gateway down"));

      const payout = await service.initiatePayout(transactionId);

      expect(payout.status).toBe(PAYOUT_STATUS.FAILED);
      expect(payout.isMock).toBe(false);
    });
  });

  it("release rejects when conditions unmet", async () => {
    (prisma.transaction as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
      id: transactionId,
      status: TransactionStatus.IN_PROGRESS,
      listing: { status: ListingStatus.LIVE },
      powerOfAttorney: null,
    });
    await expect(service.release(transactionId, "staff-1")).rejects.toBeInstanceOf(BadRequestException);
  });
});
