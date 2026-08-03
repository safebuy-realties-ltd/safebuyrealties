import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ListingStatus, Prisma, TransactionStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { TransactionsService } from "./transactions.service";
import { PURCHASE_BLOCK } from "./purchase-readiness";

const buyerActor: JwtPayload = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};

const baseListing = {
  id: "listing-1",
  sellerId: "seller-1",
  title: "Test Home",
  description: "A property",
  location: "Lagos",
  price: new Prisma.Decimal("25000000"),
  currency: "NGN",
  status: ListingStatus.LIVE,
  beds: 4,
  baths: 3,
  landAreaSqm: new Prisma.Decimal("450"),
  buildType: "detached",
  verifiedAt: new Date("2026-01-15T10:00:00.000Z"),
  rejectionReason: null,
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
  updatedAt: new Date("2026-01-16T12:00:00.000Z"),
};

/**
 * A row shaped the way `TRANSACTION_INCLUDE` returns one. E1-S4 added the last three keys, and a
 * fixture that omits them would be testing a row Prisma never produces.
 */
const baseTransaction = {
  id: "tx-1",
  status: TransactionStatus.INITIATED as TransactionStatus,
  buyerId: buyerActor.sub,
  listingId: baseListing.id,
  createdAt: new Date("2026-02-01T10:00:00.000Z"),
  updatedAt: new Date("2026-02-01T10:00:00.000Z"),
  listing: baseListing,
  dueDiligenceOrder: null,
  buyer: { kycRecord: null },
  payments: [] as Array<Record<string, unknown>>,
};

describe("TransactionsService", () => {
  let service: TransactionsService;
  let flags: { isEnabled: jest.Mock };
  let prisma: {
    listing: { findUnique: jest.Mock };
    transaction: { findFirst: jest.Mock; create: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      listing: { findUnique: jest.fn() },
      transaction: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    };
    flags = { isEnabled: jest.fn(() => true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FeatureFlagsService, useValue: flags },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  describe("create", () => {
    it("rejects non-buyers", async () => {
      await expect(
        service.create(
          { listingId: "listing-1" },
          { ...buyerActor, role: UserRole.SELLER },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects when listing is not found", async () => {
      prisma.listing.findUnique.mockResolvedValue(null);

      await expect(service.create({ listingId: "missing" }, buyerActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects UNDER_OFFER listings with ConflictException", async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...baseListing,
        status: ListingStatus.UNDER_OFFER,
      });

      await expect(service.create({ listingId: "listing-1" }, buyerActor)).rejects.toThrow(
        new ConflictException(
          "This property is currently under offer and cannot be reserved by another buyer",
        ),
      );
      expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it("rejects non-live listings with BadRequestException", async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...baseListing,
        status: ListingStatus.VERIFIED,
      });

      await expect(service.create({ listingId: "listing-1" }, buyerActor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("creates a transaction for a live listing", async () => {
      prisma.listing.findUnique.mockResolvedValue(baseListing);
      prisma.transaction.findFirst.mockResolvedValue(null);
      prisma.transaction.create.mockResolvedValue({ ...baseTransaction });

      const result = await service.create({ listingId: "listing-1" }, buyerActor);

      expect(result.id).toBe("tx-1");
      expect(result.status).toBe(TransactionStatus.INITIATED);
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            listingId: "listing-1",
            buyerId: buyerActor.sub,
            status: TransactionStatus.INITIATED,
          },
        }),
      );

      // E1-S4. The newest payment travels with the row. This is the fact the browser used to keep in
      // localStorage, so asserting the shape of the include is asserting that a cleared browser
      // still finds its checkout.
      const { include } = prisma.transaction.create.mock.calls[0][0];
      expect(include.listing).toBe(true);
      expect(include.payments.take).toBe(1);
      expect(include.payments.orderBy).toEqual({ createdAt: "desc" });
    });

    it("returns an existing open transaction instead of creating a duplicate", async () => {
      prisma.listing.findUnique.mockResolvedValue(baseListing);
      prisma.transaction.findFirst.mockResolvedValue({ ...baseTransaction, id: "tx-existing" });

      const result = await service.create({ listingId: "listing-1" }, buyerActor);

      expect(result.id).toBe("tx-existing");
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  // E1-S4 criteria 1, 5 and 6. The buyer's own read of a transaction carries the purchase decision
  // and the payment association, because the browser is not allowed to work either of them out.
  describe("the purchase decision on a read", () => {
    const read = async (row: Record<string, unknown>) => {
      prisma.transaction.findUnique.mockResolvedValue({ ...baseTransaction, ...row });
      return service.findOne("tx-1", buyerActor);
    };

    it("offers the purchase once due diligence is complete and KYC is verified", async () => {
      const result = await read({
        status: TransactionStatus.DD_COMPLETE,
        dueDiligenceOrder: { verdict: "PROCEED" },
        buyer: { kycRecord: { status: "VERIFIED" } },
      });

      expect(result.purchase.canPurchase).toBe(true);
      expect(result.purchase.blockedBy).toBeNull();
    });

    it("withholds it while due diligence is still running", async () => {
      const result = await read({ status: TransactionStatus.DD_IN_PROGRESS });

      expect(result.purchase.canPurchase).toBe(false);
      expect(result.purchase.blockedBy).toBe(PURCHASE_BLOCK.DUE_DILIGENCE_UNFINISHED);
    });

    it("blocks it on a verdict against, and says so", async () => {
      const result = await read({
        status: TransactionStatus.DD_COMPLETE,
        dueDiligenceOrder: { verdict: "DO_NOT_PROCEED" },
        buyer: { kycRecord: { status: "VERIFIED" } },
      });

      expect(result.purchase.canPurchase).toBe(false);
      expect(result.purchase.blockedBy).toBe(PURCHASE_BLOCK.VERDICT_AGAINST);
      expect(result.purchase.reason).toMatch(/due diligence/i);
    });

    it("blocks it when KYC is not verified and the gate is on", async () => {
      const result = await read({
        status: TransactionStatus.DD_COMPLETE,
        dueDiligenceOrder: { verdict: "PROCEED" },
        buyer: { kycRecord: { status: "PENDING" } },
      });

      expect(result.purchase.blockedBy).toBe(PURCHASE_BLOCK.KYC_REQUIRED);
    });

    it("withholds it entirely while the flag is off", async () => {
      flags.isEnabled.mockReturnValue(false);

      const result = await read({
        status: TransactionStatus.DD_COMPLETE,
        dueDiligenceOrder: { verdict: "PROCEED" },
        buyer: { kycRecord: { status: "VERIFIED" } },
      });

      expect(result.purchase.blockedBy).toBe(PURCHASE_BLOCK.FEATURE_OFF);
    });

    it("carries the newest payment so a cleared browser can still find its checkout", async () => {
      const result = await read({
        status: TransactionStatus.PURCHASE_PENDING,
        payments: [
          {
            id: "pay-9",
            status: "PENDING",
            intent: "PROPERTY_PURCHASE",
            amount: new Prisma.Decimal("25000000"),
            providerReference: "ref-9",
            createdAt: new Date("2026-02-02T10:00:00.000Z"),
          },
        ],
      });

      expect(result.latestPayment).toEqual({
        id: "pay-9",
        status: "PENDING",
        intent: "PROPERTY_PURCHASE",
        amount: "25000000",
        reference: "ref-9",
        createdAt: "2026-02-02T10:00:00.000Z",
      });
    });

    it("says there is no payment yet rather than inventing one", async () => {
      const result = await read({ status: TransactionStatus.INITIATED });

      expect(result.latestPayment).toBeNull();
    });
  });
});
