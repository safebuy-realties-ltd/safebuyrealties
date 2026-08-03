import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ListingStatus, PaymentStatus, Prisma, TransactionStatus, UserRole } from "@prisma/client";
import { StandaloneDdService } from "./standalone-dd.service";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformConfigService } from "../platform-config/platform-config.service";
import { PaystackService } from "../payments/paystack.service";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ConfigService } from "@nestjs/config";
import { SbrIdService } from "../sbr-id/sbr-id.service";
import { StorageService } from "../storage/storage.service";
import { DdCmsService } from "../dd-cms/dd-cms.service";
import { DdCoreService } from "../dd-core/dd-core.service";
import { DdCaseSerializer } from "../dd-core/dd-case.serializer";
import { TransactionStateService } from "../transactions/transaction-state.service";

const buyerActor = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};

describe("StandaloneDdService", () => {
  let service: StandaloneDdService;
  let prisma: any;
  let sbrId: {
    nextServiceId: jest.Mock;
    nextCaseId: jest.Mock;
    nextTransactionId: jest.Mock;
    nextBuyerId: jest.Mock;
  };

  beforeEach(async () => {
    sbrId = {
      nextServiceId: jest.fn().mockResolvedValue("SBR-SRV-BUY-20260717-001"),
      nextCaseId: jest.fn().mockResolvedValue("SBR-CASE-DD-LOS-20260717-001"),
      nextTransactionId: jest.fn().mockResolvedValue("SBR-TXN-20260717-001"),
      nextBuyerId: jest.fn().mockResolvedValue("SBR-BUY-LOS-20260717-001"),
    };

    prisma = {
      listing: { findUnique: jest.fn() },
      externalProperty: { create: jest.fn() },
      serviceCatalogItem: { findMany: jest.fn() },
      serviceBundle: { findUnique: jest.fn() },
      serviceRequest: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      transaction: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      dueDiligenceAssignment: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      dueDiligenceOrder: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      accountActivationToken: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StandaloneDdService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PlatformConfigService,
          useValue: { getVatRate: jest.fn().mockResolvedValue(0.075) },
        },
        {
          provide: PaystackService,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(true),
            customerEmail: jest.fn((email: string) => email),
            initializeTransaction: jest.fn().mockResolvedValue({
              authorizationUrl: "https://checkout.paystack.com/test_access",
              accessCode: "test_access",
              reference: "psk_ref_standalone_1",
            }),
          },
        },
        { provide: EmailService, useValue: { sendPaymentReceipt: jest.fn(), sendStaffDdAlert: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn(), createForStaff: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("http://localhost:8080") },
        },
        { provide: SbrIdService, useValue: sbrId },
        {
          provide: StorageService,
          useValue: { getSignedUrl: jest.fn().mockResolvedValue("/uploads/report.pdf"), upload: jest.fn() },
        },
        {
          provide: DdCmsService,
          useValue: {
            getActiveDefinitions: jest.fn().mockResolvedValue([
              {
                code: "LEGAL_CHECK",
                letter: "A",
                name: "Schedule A — Legal Due Diligence",
                shortName: "Legal",
                description: "Legal",
                suggestedProfessionalTypes: ["LAWYER"],
                items: [{ code: "LEGAL_TITLE_SEARCH", label: "Title search" }],
              },
              {
                code: "PHYSICAL_CHECK",
                letter: "C",
                name: "Schedule C — Physical Inspection",
                shortName: "Physical",
                description: "Physical",
                suggestedProfessionalTypes: ["SURVEYOR"],
                items: [{ code: "PHYS_BOUNDARY_BEACONS", label: "Boundary / beacon verification" }],
              },
            ]),
            validateChecklistSelections: jest.fn().mockImplementation(async (selections: Record<string, string[]>) => {
              const scheduleCodes = Object.keys(selections).filter((k) => (selections[k]?.length ?? 0) > 0);
              if (!scheduleCodes.length) {
                return { ok: false, message: "Select at least one checklist item under a schedule." };
              }
              return { ok: true, scheduleCodes };
            }),
            suggestedTypesForSchedules: jest.fn().mockResolvedValue(["LAWYER"]),
          },
        },
        // The real dd-core providers, not doubles. These tests are the regression net proving the
        // standalone responses did not change shape when the case machinery moved out of this
        // service, and a stubbed serialiser would prove nothing at all.
        DdCaseSerializer,
        DdCoreService,
        TransactionStateService,
      ],
    }).compile();

    service = module.get(StandaloneDdService);
  });

  it("creates a standalone order for an external property", async () => {
    (prisma.serviceCatalogItem.findMany as jest.Mock).mockResolvedValue([
      {
        id: "item-legal",
        code: "LEGAL_CHECK",
        name: "Schedule A - Legal Due Diligence",
        basePrice: new Prisma.Decimal(350000),
        active: true,
      },
    ]);
    (prisma.externalProperty.create as jest.Mock).mockResolvedValue({
      id: "external-1",
      address: "12 Admiralty Way",
      state: "Lagos",
      lga: "Eti-Osa",
      propertyType: "Duplex",
      approxSize: null,
      titleRef: "TR-001",
      sellerName: null,
      sellerContact: null,
      notes: null,
      documentKeys: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: null,
    });
    (prisma.serviceRequest.create as jest.Mock).mockResolvedValue({
      id: "service-request-1",
      serviceId: "SBR-SRV-BUY-20260717-001",
      caseId: "SBR-CASE-DD-LOS-20260717-001",
      source: "STANDALONE",
      status: "SUBMITTED",
      guestName: "Ada Buyer",
      guestEmail: "ada@example.com",
      guestPhone: "08030000000",
      buyerId: "buyer-guest-1",
      bundleId: null,
      itemIds: ["item-legal"],
      checklistSelections: { LEGAL_CHECK: ["LEGAL_TITLE_SEARCH"] },
      subtotal: new Prisma.Decimal(0),
      vatAmount: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
      listingId: null,
      externalPropertyId: "external-1",
      transactionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      listing: null,
      externalProperty: {
        id: "external-1",
        address: "12 Admiralty Way",
        state: "Lagos",
        lga: "Eti-Osa",
        propertyType: "Duplex",
        approxSize: null,
        titleRef: "TR-001",
        sellerName: null,
        sellerContact: null,
        notes: null,
        documentKeys: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: null,
      },
      transaction: null,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: "buyer-guest-1",
      email: "ada@example.com",
      role: UserRole.BUYER,
    });
    (prisma.dueDiligenceOrder.create as jest.Mock).mockResolvedValue({
      id: "dd-order-1",
      serviceId: "SBR-SRV-BUY-20260717-001",
      status: "SUBMITTED",
    });
    (prisma.dueDiligenceOrder.findUnique as jest.Mock).mockResolvedValue({
      id: "dd-order-1",
      serviceId: "SBR-SRV-BUY-20260717-001",
      caseId: "SBR-CASE-DD-LOS-20260717-001",
      status: "SUBMITTED",
      checklistSelections: { LEGAL_CHECK: ["LEGAL_TITLE_SEARCH"] },
      reportStorageKeys: [],
      assignments: [],
      verdict: null,
      staffNotes: null,
      completedAt: null,
      buyerId: "buyer-guest-1",
    });
    (prisma.serviceRequest.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: "service-request-1",
      serviceId: "SBR-SRV-BUY-20260717-001",
      caseId: "SBR-CASE-DD-LOS-20260717-001",
      source: "STANDALONE",
      status: "SUBMITTED",
      guestName: "Ada Buyer",
      guestEmail: "ada@example.com",
      guestPhone: "08030000000",
      buyerId: "buyer-guest-1",
      bundleId: null,
      itemIds: ["item-legal"],
      checklistSelections: { LEGAL_CHECK: ["LEGAL_TITLE_SEARCH"] },
      subtotal: new Prisma.Decimal(0),
      vatAmount: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
      listingId: null,
      externalPropertyId: "external-1",
      transactionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      listing: null,
      externalProperty: {
        id: "external-1",
        address: "12 Admiralty Way",
        state: "Lagos",
        lga: "Eti-Osa",
        propertyType: "Duplex",
        approxSize: null,
        titleRef: "TR-001",
        sellerName: null,
        sellerContact: null,
        notes: null,
        documentKeys: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: null,
      },
      transaction: null,
    });

    const result = await service.createOrder({
      externalProperty: {
        address: "12 Admiralty Way",
        state: "Lagos",
        lga: "Eti-Osa",
        propertyType: "Duplex",
        titleRef: "TR-001",
      },
      guestName: "Ada Buyer",
      guestEmail: "ada@example.com",
      guestPhone: "08030000000",
      checklistSelections: { LEGAL_CHECK: ["LEGAL_TITLE_SEARCH"] },
    });

    expect(prisma.externalProperty.create).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result.serviceId).toBe("SBR-SRV-BUY-20260717-001");
    expect(result.status).toBe("SUBMITTED");
    expect(result.checklistSelections).toEqual({ LEGAL_CHECK: ["LEGAL_TITLE_SEARCH"] });
    expect(result.property?.kind).toBe("EXTERNAL");
  });

  it("creates a standalone order for an on-platform listing", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      id: "listing-1",
      title: "Lekki Terrace",
      location: "Lekki, Lagos",
      propertyId: "SBR-PROP-LOS-2026-00001",
      currency: "NGN",
      sellerId: "seller-1",
      status: ListingStatus.LIVE,
      isPublished: true,
    });
    (prisma.serviceCatalogItem.findMany as jest.Mock).mockResolvedValue([
      {
        id: "item-physical",
        code: "PHYSICAL_CHECK",
        name: "Schedule C - Physical Inspection",
        basePrice: new Prisma.Decimal(275000),
        active: true,
      },
    ]);
    (prisma.serviceRequest.create as jest.Mock).mockResolvedValue({
      id: "service-request-2",
      serviceId: "SBR-SRV-BUY-20260717-001",
      caseId: "SBR-CASE-DD-LOS-20260717-001",
      source: "STANDALONE",
      status: "PENDING_PAYMENT",
      guestName: "Ada Buyer",
      guestEmail: "ada@example.com",
      guestPhone: "08030000000",
      buyerId: buyerActor.sub,
      bundleId: null,
      itemIds: ["item-physical"],
      subtotal: new Prisma.Decimal(275000),
      vatAmount: new Prisma.Decimal(20625),
      total: new Prisma.Decimal(295625),
      listingId: "listing-1",
      externalPropertyId: null,
      transactionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      listing: {
        id: "listing-1",
        title: "Lekki Terrace",
        location: "Lekki, Lagos",
        propertyId: "SBR-PROP-LOS-2026-00001",
        currency: "NGN",
        sellerId: "seller-1",
        status: ListingStatus.LIVE,
        isPublished: true,
      },
      externalProperty: null,
      transaction: null,
    });

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: buyerActor.sub,
      email: buyerActor.email,
      role: UserRole.BUYER,
    });
    (prisma.dueDiligenceOrder.create as jest.Mock).mockResolvedValue({
      id: "dd-order-2",
      serviceId: "SBR-SRV-BUY-20260717-001",
      status: "SUBMITTED",
    });
    (prisma.dueDiligenceOrder.findUnique as jest.Mock).mockResolvedValue({
      id: "dd-order-2",
      serviceId: "SBR-SRV-BUY-20260717-001",
      caseId: "SBR-CASE-DD-LOS-20260717-001",
      status: "SUBMITTED",
      checklistSelections: { PHYSICAL_CHECK: ["PHYS_BOUNDARY_BEACONS"] },
      reportStorageKeys: [],
      assignments: [],
      verdict: null,
      staffNotes: null,
      completedAt: null,
      buyerId: buyerActor.sub,
    });
    (prisma.serviceRequest.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: "service-request-2",
      serviceId: "SBR-SRV-BUY-20260717-001",
      caseId: "SBR-CASE-DD-LOS-20260717-001",
      source: "STANDALONE",
      status: "SUBMITTED",
      guestName: "Ada Buyer",
      guestEmail: "ada@example.com",
      guestPhone: "08030000000",
      buyerId: buyerActor.sub,
      bundleId: null,
      itemIds: ["item-physical"],
      checklistSelections: { PHYSICAL_CHECK: ["PHYS_BOUNDARY_BEACONS"] },
      subtotal: new Prisma.Decimal(0),
      vatAmount: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
      listingId: "listing-1",
      externalPropertyId: null,
      transactionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      listing: {
        id: "listing-1",
        title: "Lekki Terrace",
        location: "Lekki, Lagos",
        propertyId: "SBR-PROP-LOS-2026-00001",
        currency: "NGN",
        sellerId: "seller-1",
        status: ListingStatus.LIVE,
        isPublished: true,
      },
      externalProperty: null,
      transaction: null,
    });

    const result = await service.createOrder(
      {
        listingId: "listing-1",
        guestName: "Ada Buyer",
        guestEmail: "ada@example.com",
        guestPhone: "08030000000",
        checklistSelections: { PHYSICAL_CHECK: ["PHYS_BOUNDARY_BEACONS"] },
      },
      buyerActor,
    );

    expect(prisma.listing.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "listing-1" } }),
    );
    expect(result.status).toBe("SUBMITTED");
    expect(result.property?.kind).toBe("LISTING");
  });

  it("initiates standalone payment via Paystack without reserving a listing", async () => {
    (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue({
      id: "service-request-3",
      serviceId: "SBR-SRV-BUY-20260717-001",
      caseId: "SBR-CASE-DD-LOS-20260717-001",
      source: "STANDALONE",
      status: "PENDING_PAYMENT",
      guestName: "Ada Buyer",
      guestEmail: "ada@example.com",
      guestPhone: "08030000000",
      buyerId: null,
      bundleId: null,
      itemIds: ["item-legal"],
      subtotal: new Prisma.Decimal(350000),
      vatAmount: new Prisma.Decimal(26250),
      total: new Prisma.Decimal(376250),
      listingId: null,
      externalPropertyId: "external-1",
      transactionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      listing: null,
      externalProperty: {
        id: "external-1",
        address: "12 Admiralty Way",
        state: "Lagos",
        lga: "Eti-Osa",
        propertyType: "Duplex",
        approxSize: null,
        titleRef: "TR-001",
        sellerName: null,
        sellerContact: null,
        notes: null,
        documentKeys: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: null,
      },
      transaction: null,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: "buyer-guest",
      role: UserRole.BUYER,
      publicId: null,
    });
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({
      id: "tx-standalone-1",
      listingId: null,
    });
    (prisma.dueDiligenceOrder.upsert as jest.Mock).mockResolvedValue({ id: "dd-1" });
    (prisma.payment.create as jest.Mock).mockResolvedValue({
      id: "pay-standalone-1",
      transactionId: "tx-standalone-1",
    });

    (prisma.payment.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.update as jest.Mock).mockResolvedValue({});

    const result = await service.initiatePayment("SBR-SRV-BUY-20260717-001", {
      callbackUrl: "http://localhost:8080/due-diligence/request",
    });

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "STANDALONE",
          listingId: null,
        }),
      }),
    );
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          listingId: null,
          intent: "DD_SERVICE",
        }),
      }),
    );
    expect(result.accessCode).toBe("test_access");
    expect(result.authorizationUrl).toContain("checkout.paystack.com");
    expect(result.reference).toBe("psk_ref_standalone_1");
  });

  it("marks a case complete with verdict and transaction status", async () => {
    (prisma.dueDiligenceOrder.findUnique as jest.Mock)
      .mockResolvedValueOnce({
      id: "dd-1",
      buyerId: "buyer-1",
      listingId: null,
      externalPropertyId: "external-1",
      transactionId: "tx-1",
      serviceId: "SBR-SRV-BUY-20260717-001",
      caseId: "SBR-CASE-DD-LOS-20260717-001",
      source: "STANDALONE",
      bundleId: null,
      itemIds: ["item-legal"],
      subtotal: new Prisma.Decimal(350000),
      vatAmount: new Prisma.Decimal(26250),
      total: new Prisma.Decimal(376250),
      status: "PAID",
      verdict: null,
      reportStorageKeys: [],
      staffNotes: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      listing: null,
      externalProperty: {
        id: "external-1",
        address: "12 Admiralty Way",
        state: "Lagos",
        lga: "Eti-Osa",
        propertyType: "Duplex",
        approxSize: null,
        titleRef: "TR-001",
        sellerName: null,
        sellerContact: null,
        notes: null,
        documentKeys: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: null,
      },
      transaction: { id: "tx-1", payments: [] },
    })
      .mockResolvedValueOnce({
        id: "dd-1",
        buyerId: "buyer-1",
        listingId: null,
        externalPropertyId: "external-1",
        transactionId: "tx-1",
        serviceId: "SBR-SRV-BUY-20260717-001",
        caseId: "SBR-CASE-DD-LOS-20260717-001",
        source: "STANDALONE",
        bundleId: null,
        itemIds: ["item-legal"],
        subtotal: new Prisma.Decimal(350000),
        vatAmount: new Prisma.Decimal(26250),
        total: new Prisma.Decimal(376250),
        status: "COMPLETE",
        verdict: "PROCEED",
        reportStorageKeys: [],
        staffNotes: "All clear.",
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        listing: null,
        externalProperty: {
          id: "external-1",
          address: "12 Admiralty Way",
          state: "Lagos",
          lga: "Eti-Osa",
          propertyType: "Duplex",
          approxSize: null,
          titleRef: "TR-001",
          sellerName: null,
          sellerContact: null,
          notes: null,
          documentKeys: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          createdById: null,
        },
        transaction: { id: "tx-1", status: TransactionStatus.DD_COMPLETE, payments: [] },
      });
    (prisma.dueDiligenceOrder.update as jest.Mock).mockResolvedValue({
      id: "dd-1",
      buyerId: "buyer-1",
      listingId: null,
      externalPropertyId: "external-1",
      transactionId: "tx-1",
      serviceId: "SBR-SRV-BUY-20260717-001",
      caseId: "SBR-CASE-DD-LOS-20260717-001",
      source: "STANDALONE",
      bundleId: null,
      itemIds: ["item-legal"],
      subtotal: new Prisma.Decimal(350000),
      vatAmount: new Prisma.Decimal(26250),
      total: new Prisma.Decimal(376250),
      status: "COMPLETE",
      verdict: "PROCEED",
      reportStorageKeys: [],
      staffNotes: "All clear.",
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      listing: null,
      externalProperty: {
        id: "external-1",
        address: "12 Admiralty Way",
        state: "Lagos",
        lga: "Eti-Osa",
        propertyType: "Duplex",
        approxSize: null,
        titleRef: "TR-001",
        sellerName: null,
        sellerContact: null,
        notes: null,
        documentKeys: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: null,
      },
      transaction: { id: "tx-1", payments: [] },
    });
    const result = await service.updateOrder(
      "dd-1",
      { status: "COMPLETE", verdict: "PROCEED", staffNotes: "All clear." },
      {
        sub: "staff-1",
        email: "staff@safebuyrealties.test",
        role: UserRole.STAFF,
        professionalType: null,
      },
    );

    // E1-S2. The move is a conditional write carrying the statuses it is allowed to move from,
    // so the check and the write are one statement rather than a read followed by a hope.
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "tx-1",
        status: { in: [TransactionStatus.DD_PURCHASED, TransactionStatus.DD_IN_PROGRESS] },
      },
      data: { status: TransactionStatus.DD_COMPLETE },
    });
    expect(result.status).toBe("COMPLETE");
    expect(result.verdict).toBe("PROCEED");
  });

  it("throws when loading a missing order", async () => {
    (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.getOrder("missing")).rejects.toThrow(NotFoundException);
  });
});
