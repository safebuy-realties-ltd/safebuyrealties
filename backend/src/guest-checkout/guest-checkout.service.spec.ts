import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ListingStatus, Prisma, UserRole } from "@prisma/client";
import { GuestCheckoutService } from "./guest-checkout.service";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformConfigService } from "../platform-config/platform-config.service";
import { PaystackService } from "../payments/paystack.service";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ConfigService } from "@nestjs/config";
import { SbrIdService } from "../sbr-id/sbr-id.service";

const listingId = "listing-1";
const buyerId = "buyer-1";

const liveListing = {
  id: listingId,
  title: "Lekki Flat",
  location: "Lekki, Lagos",
  currency: "NGN",
  status: ListingStatus.LIVE,
  isPublished: true,
};

const catalogItem = {
  id: "item-legal",
  code: "LEGAL_CHECK",
  name: "Legal Check",
  basePrice: new Prisma.Decimal(350000),
  active: true,
};

describe("GuestCheckoutService", () => {
  let service: GuestCheckoutService;
  let prisma: Record<string, jest.Mock | object>;
  let sbrId: {
    nextBuyerId: jest.Mock;
    nextServiceId: jest.Mock;
    nextCaseId: jest.Mock;
    nextTransactionId: jest.Mock;
  };

  beforeEach(async () => {
    sbrId = {
      nextBuyerId: jest.fn().mockResolvedValue("SBR-BUY-LOS-20260616-001"),
      nextServiceId: jest.fn().mockResolvedValue("SBR-SRV-BUY-20260616-001"),
      nextCaseId: jest.fn().mockResolvedValue("SBR-CASE-DD-LOS-20260616-001"),
      nextTransactionId: jest.fn().mockResolvedValue("SBR-TXN-20260616-001"),
    };

    prisma = {
      listing: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      serviceCatalogItem: { findMany: jest.fn() },
      serviceBundle: { findUnique: jest.fn() },
      platformConfig: { upsert: jest.fn() },
      serviceRequest: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      transaction: { create: jest.fn(), update: jest.fn() },
      dueDiligenceOrder: { create: jest.fn(), updateMany: jest.fn() },
      payment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      accountActivationToken: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestCheckoutService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PlatformConfigService,
          useValue: { getVatRate: jest.fn().mockResolvedValue(0.075) },
        },
        {
          provide: PaystackService,
          useValue: { isConfigured: () => false, customerEmail: (e: string) => e },
        },
        { provide: EmailService, useValue: { sendPaymentReceipt: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn(), createForStaff: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("http://localhost:8080") },
        },
        { provide: SbrIdService, useValue: sbrId },
      ],
    }).compile();

    service = module.get(GuestCheckoutService);
  });

  describe("createOrder", () => {
    it("rejects non-public listings", async () => {
      (prisma.listing as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
        ...liveListing,
        status: ListingStatus.DRAFT,
        isPublished: false,
      });

      await expect(
        service.createOrder({
          listingId,
          guestEmail: "guest@test.com",
          itemIds: ["LEGAL_CHECK"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a pending service request for a live listing", async () => {
      (prisma.listing as { findUnique: jest.Mock }).findUnique.mockResolvedValue(liveListing);
      (prisma.serviceCatalogItem as { findMany: jest.Mock }).findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([catalogItem]);
      (prisma.platformConfig as { upsert: jest.Mock }).upsert.mockResolvedValue({
        inspectionFee: new Prisma.Decimal(50000),
      });
      (prisma.user as { findUnique: jest.Mock }).findUnique.mockResolvedValue(null);
      (prisma.user as { create: jest.Mock }).create.mockResolvedValue({
        id: buyerId,
        publicId: null,
        role: UserRole.BUYER,
      });
      (prisma.user as { update: jest.Mock }).update.mockResolvedValue({});
      (prisma.serviceRequest as { create: jest.Mock }).create.mockResolvedValue({
        serviceId: "SBR-SRV-BUY-20260616-001",
        caseId: "SBR-CASE-DD-LOS-20260616-001",
        status: "PENDING_PAYMENT",
        guestName: "Guest Buyer",
        guestEmail: "guest@test.com",
        guestPhone: "",
        bundleId: null,
        itemIds: ["LEGAL_CHECK"],
        includeInspection: false,
        inspectionFee: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(350000),
        vatAmount: new Prisma.Decimal(26250),
        total: new Prisma.Decimal(376250),
        transactionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        listing: {
          id: listingId,
          title: liveListing.title,
          location: liveListing.location,
          propertyId: null,
          currency: "NGN",
        },
      });

      const result = await service.createOrder({
        listingId,
        guestEmail: "guest@test.com",
        itemIds: ["LEGAL_CHECK"],
      });

      expect(result.serviceId).toBe("SBR-SRV-BUY-20260616-001");
      expect(result.status).toBe("PENDING_PAYMENT");
      expect(result.buyerPublicId).toBe("SBR-BUY-LOS-20260616-001");
      expect(sbrId.nextServiceId).toHaveBeenCalled();
    });
  });

  describe("getOrder", () => {
    it("throws when order is missing", async () => {
      (prisma.serviceRequest as { findUnique: jest.Mock }).findUnique.mockResolvedValue(null);
      await expect(service.getOrder("missing")).rejects.toThrow(NotFoundException);
    });
  });
});
