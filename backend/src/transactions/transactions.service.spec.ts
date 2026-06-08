import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ListingStatus, Prisma, TransactionStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { TransactionsService } from "./transactions.service";

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

describe("TransactionsService", () => {
  let service: TransactionsService;
  let prisma: {
    listing: { findUnique: jest.Mock };
    transaction: { findFirst: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      listing: { findUnique: jest.fn() },
      transaction: { findFirst: jest.fn(), create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionsService, { provide: PrismaService, useValue: prisma }],
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
      prisma.transaction.create.mockResolvedValue({
        id: "tx-1",
        status: TransactionStatus.INITIATED,
        buyerId: buyerActor.sub,
        listingId: baseListing.id,
        createdAt: new Date("2026-02-01T10:00:00.000Z"),
        updatedAt: new Date("2026-02-01T10:00:00.000Z"),
        listing: baseListing,
      });

      const result = await service.create({ listingId: "listing-1" }, buyerActor);

      expect(result.id).toBe("tx-1");
      expect(result.status).toBe(TransactionStatus.INITIATED);
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: {
          listingId: "listing-1",
          buyerId: buyerActor.sub,
          status: TransactionStatus.INITIATED,
        },
        include: { listing: true },
      });
    });

    it("returns an existing open transaction instead of creating a duplicate", async () => {
      prisma.listing.findUnique.mockResolvedValue(baseListing);
      prisma.transaction.findFirst.mockResolvedValue({
        id: "tx-existing",
        status: TransactionStatus.INITIATED,
        buyerId: buyerActor.sub,
        listingId: baseListing.id,
        createdAt: new Date("2026-02-01T10:00:00.000Z"),
        updatedAt: new Date("2026-02-01T10:00:00.000Z"),
        listing: baseListing,
      });

      const result = await service.create({ listingId: "listing-1" }, buyerActor);

      expect(result.id).toBe("tx-existing");
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });
});
