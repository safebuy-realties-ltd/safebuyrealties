import { Test, TestingModule } from "@nestjs/testing";
import { ListingMediaType, ListingStatus, Prisma, VerificationStepStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SbrIdService } from "../sbr-id/sbr-id.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { ListingsService } from "./listings.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { UserRole } from "@prisma/client";
import { publiclyVisibleWhere } from "./listings-public.helper";

const sellerActor: JwtPayload = {
  sub: "seller-1",
  email: "seller@safebuyrealties.test",
  role: UserRole.SELLER,
  professionalType: null,
};

const baseListing = {
  id: "listing-1",
  sellerId: "seller-1",
  propertyId: null,
  title: "Test Home",
  description: "A property",
  location: "Lagos",
  price: new Prisma.Decimal("25000000"),
  currency: "NGN",
  status: ListingStatus.DRAFT,
  isPublished: false,
  propertyType: null,
  beds: 4,
  baths: 3,
  landAreaSqm: new Prisma.Decimal("450.50"),
  buildType: "detached",
  verifiedAt: null,
  rejectionReason: null,
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
  updatedAt: new Date("2026-01-16T12:00:00.000Z"),
  seller: { firstName: "Ada", lastName: "Seller" },
  media: [
    {
      id: "media-1",
      listingId: "listing-1",
      storageKey: "listings/listing-1/hero.jpg",
      type: ListingMediaType.HERO,
      sortOrder: 0,
      createdAt: new Date("2026-01-15T11:00:00.000Z"),
    },
    {
      id: "media-2",
      listingId: "listing-1",
      storageKey: "listings/listing-1/gallery-1.jpg",
      type: ListingMediaType.GALLERY,
      sortOrder: 1,
      createdAt: new Date("2026-01-15T11:01:00.000Z"),
    },
  ],
};

const staffActor: JwtPayload = {
  sub: "staff-1",
  email: "staff@safebuyrealties.test",
  role: UserRole.STAFF,
  professionalType: null,
};

const buyerActor: JwtPayload = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};

describe("ListingsService", () => {
  let service: ListingsService;
  let audit: { log: jest.Mock };
  let notifications: { create: jest.Mock; createForStaff: jest.Mock };
  let sbrId: { nextPropertyId: jest.Mock };
  let prisma: {
    $transaction: jest.Mock;
    listing: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    verificationStep: { count: jest.Mock; createMany: jest.Mock; findMany: jest.Mock };
    savedProperty: { count: jest.Mock; upsert: jest.Mock; findMany: jest.Mock };
    dueDiligenceOrder: { count: jest.Mock };
    transaction: { count: jest.Mock; findMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      create: jest.fn().mockResolvedValue(undefined),
      createForStaff: jest.fn().mockResolvedValue(undefined),
    };
    sbrId = {
      nextPropertyId: jest.fn().mockResolvedValue("SBR-PROP-LOS-2026-00001"),
    };
    prisma = {
      $transaction: jest.fn(),
      listing: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      verificationStep: {
        count: jest.fn().mockResolvedValue(1),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      savedProperty: {
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      dueDiligenceOrder: { count: jest.fn().mockResolvedValue(0) },
      transaction: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([{ id: "tx-1" }]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "seller-1", role: UserRole.SELLER }),
      },
    };
    prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
    prisma.listing.count.mockResolvedValue(0);
    prisma.listing.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
        { provide: SbrIdService, useValue: sbrId },
      ],
    }).compile();

    service = module.get(ListingsService);
  });

  describe("create with spec fields", () => {
    it("persists beds, baths, landAreaSqm, and buildType on create", async () => {
      const created = { ...baseListing, beds: null, baths: null, landAreaSqm: null, buildType: null };
      prisma.listing.create.mockResolvedValue(created);
      prisma.listing.findUniqueOrThrow.mockResolvedValue({
        ...baseListing,
        beds: 4,
        baths: 3,
        landAreaSqm: new Prisma.Decimal("450"),
        buildType: "Detached",
      });

      const result = await service.create(
        {
          title: "New Home",
          description: "Desc",
          location: "Abuja",
          price: 1000000,
          beds: 4,
          baths: 3,
          landAreaSqm: 450,
          buildType: "Detached",
        },
        sellerActor,
      );

      expect(prisma.listing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          beds: 4,
          baths: 3,
          landAreaSqm: 450,
          buildType: "Detached",
          status: ListingStatus.DRAFT,
          isPublished: false,
        }),
      });
      expect(result).toMatchObject({
        beds: 4,
        baths: 3,
        landAreaSqm: 450,
        buildType: "Detached",
      });
    });

    it("forces DRAFT and isPublished false for sellers even when status is requested", async () => {
      prisma.listing.create.mockResolvedValue(baseListing);
      prisma.listing.findUniqueOrThrow.mockResolvedValue(baseListing);

      await service.create(
        {
          title: "New Home",
          description: "Desc",
          location: "Lagos",
          price: 1000000,
          status: ListingStatus.PENDING_REVIEW,
        },
        sellerActor,
      );

      expect(prisma.listing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: ListingStatus.DRAFT,
          isPublished: false,
        }),
      });
      expect(sbrId.nextPropertyId).not.toHaveBeenCalled();
    });

    it("assigns propertyId when staff creates as PENDING_REVIEW", async () => {
      prisma.listing.create.mockResolvedValue({
        ...baseListing,
        status: ListingStatus.PENDING_REVIEW,
        propertyId: "SBR-PROP-LOS-2026-00001",
      });
      prisma.listing.findUniqueOrThrow.mockResolvedValue({
        ...baseListing,
        status: ListingStatus.PENDING_REVIEW,
        propertyId: "SBR-PROP-LOS-2026-00001",
      });

      await service.create(
        {
          title: "New Home",
          description: "Desc",
          location: "Lagos",
          price: 1000000,
          status: ListingStatus.PENDING_REVIEW,
          sellerId: "seller-1",
        },
        staffActor,
      );

      expect(sbrId.nextPropertyId).toHaveBeenCalledWith("Lagos");
      expect(prisma.listing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: ListingStatus.PENDING_REVIEW,
          propertyId: "SBR-PROP-LOS-2026-00001",
          isPublished: false,
        }),
      });
    });
  });

  describe("listing serialization (DTO)", () => {
    it("includes spec fields when present on the listing", async () => {
      prisma.listing.findUnique.mockResolvedValue(baseListing);

      const result = await service.findOne("listing-1", sellerActor);

      expect(result).toMatchObject({
        id: "listing-1",
        beds: 4,
        baths: 3,
        landAreaSqm: 450.5,
        buildType: "detached",
        propertyId: null,
        isPublished: false,
        propertyType: null,
      });
    });

    it("returns null spec fields when not set", async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...baseListing,
        beds: null,
        baths: null,
        landAreaSqm: null,
        buildType: null,
        media: [],
      });

      const result = await service.findOne("listing-1", sellerActor);

      expect(result.beds).toBeNull();
      expect(result.baths).toBeNull();
      expect(result.landAreaSqm).toBeNull();
      expect(result.buildType).toBeNull();
    });

    it("serializes listing media ordered by sortOrder", async () => {
      prisma.listing.findUnique.mockResolvedValue(baseListing);

      const result = await service.findOne("listing-1", sellerActor);

      expect(result.media).toEqual([
        {
          id: "media-1",
          listingId: "listing-1",
          storageKey: "listings/listing-1/hero.jpg",
          type: "hero",
          sortOrder: 0,
          createdAt: "2026-01-15T11:00:00.000Z",
        },
        {
          id: "media-2",
          listingId: "listing-1",
          storageKey: "listings/listing-1/gallery-1.jpg",
          type: "gallery",
          sortOrder: 1,
          createdAt: "2026-01-15T11:01:00.000Z",
        },
      ]);
    });
  });

  describe("public visibility", () => {
    it("allows anonymous access to VERIFIED published listings", async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...baseListing,
        status: ListingStatus.VERIFIED,
        isPublished: true,
      });

      const result = await service.findOne("listing-1", null);

      expect(result.status).toBe(ListingStatus.VERIFIED);
      expect(result.isPublished).toBe(true);
    });

    it("denies anonymous access to VERIFIED unpublished listings", async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...baseListing,
        status: ListingStatus.VERIFIED,
        isPublished: false,
      });

      await expect(service.findOne("listing-1", null)).rejects.toThrow("Forbidden");
    });

    it("allows buyers to access VERIFIED published listings", async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...baseListing,
        status: ListingStatus.VERIFIED,
        isPublished: true,
      });

      const result = await service.findOne("listing-1", buyerActor);

      expect(result.isPublished).toBe(true);
    });
  });

  describe("audit logging on status transitions", () => {
    it("records LISTING_STATUS_CHANGED when staff updates status", async () => {
      const listingRow = {
        ...baseListing,
        status: ListingStatus.PENDING_REVIEW,
        rejectionReason: null,
      };
      prisma.listing.findUnique.mockResolvedValue(listingRow);
      prisma.listing.update.mockResolvedValue({
        ...listingRow,
        status: ListingStatus.ASSIGNED,
      });
      prisma.listing.findUniqueOrThrow.mockResolvedValue({
        ...listingRow,
        status: ListingStatus.ASSIGNED,
      });

      await service.update("listing-1", { status: ListingStatus.ASSIGNED }, staffActor);

      expect(audit.log).toHaveBeenCalledWith({
        actorId: "staff-1",
        action: AuditAction.LISTING_STATUS_CHANGED,
        entity: "Listing",
        entityId: "listing-1",
        before: {
          status: ListingStatus.PENDING_REVIEW,
          rejectionReason: null,
        },
        after: {
          status: ListingStatus.ASSIGNED,
          rejectionReason: null,
        },
      });
    });

    it("records LISTING_REJECTED when status becomes REJECTED", async () => {
      const listingRow = {
        ...baseListing,
        status: ListingStatus.IN_VERIFICATION,
        rejectionReason: null,
      };
      prisma.listing.findUnique.mockResolvedValue(listingRow);
      prisma.listing.update.mockResolvedValue({
        ...listingRow,
        status: ListingStatus.REJECTED,
        rejectionReason: "Incomplete documents",
      });
      prisma.listing.findUniqueOrThrow.mockResolvedValue({
        ...listingRow,
        status: ListingStatus.REJECTED,
        rejectionReason: "Incomplete documents",
      });

      await service.update(
        "listing-1",
        { status: ListingStatus.REJECTED, rejectionReason: "Incomplete documents" },
        staffActor,
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LISTING_REJECTED,
          before: {
            status: ListingStatus.IN_VERIFICATION,
            rejectionReason: null,
          },
          after: {
            status: ListingStatus.REJECTED,
            rejectionReason: "Incomplete documents",
          },
        }),
      );
    });

    it("does not audit when status is unchanged", async () => {
      prisma.listing.findUnique.mockResolvedValue(baseListing);
      prisma.listing.update.mockResolvedValue(baseListing);
      prisma.listing.findUniqueOrThrow.mockResolvedValue(baseListing);

      await service.update("listing-1", { title: "Renamed" }, staffActor);

      expect(audit.log).not.toHaveBeenCalled();
    });

    it("sets isPublished when staff publishes a verified listing", async () => {
      const listingRow = {
        ...baseListing,
        status: ListingStatus.VERIFIED,
        isPublished: false,
      };
      prisma.listing.findUnique.mockResolvedValue(listingRow);
      prisma.listing.update.mockResolvedValue({
        ...listingRow,
        isPublished: true,
      });
      prisma.listing.findUniqueOrThrow.mockResolvedValue({
        ...listingRow,
        isPublished: true,
      });

      await service.update("listing-1", { isPublished: true }, staffActor);

      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: "listing-1" },
        data: expect.objectContaining({ isPublished: true }),
      });
    });

    it("sets isPublished true when status transitions to LIVE", async () => {
      const listingRow = {
        ...baseListing,
        status: ListingStatus.VERIFIED,
        isPublished: false,
      };
      prisma.listing.findUnique.mockResolvedValue(listingRow);
      prisma.listing.update.mockResolvedValue({
        ...listingRow,
        status: ListingStatus.LIVE,
        isPublished: true,
      });
      prisma.listing.findUniqueOrThrow.mockResolvedValue({
        ...listingRow,
        status: ListingStatus.LIVE,
        isPublished: true,
      });

      await service.update("listing-1", { status: ListingStatus.LIVE }, staffActor);

      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: "listing-1" },
        data: expect.objectContaining({
          status: ListingStatus.LIVE,
          isPublished: true,
        }),
      });
    });
  });

  describe("findAll search filters", () => {
    it("applies minBeds and location filters for buyers", async () => {
      await service.findAll(
        { minBeds: 3, location: "Lagos" },
        buyerActor,
      );

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              publiclyVisibleWhere(),
              {
                AND: [
                  { location: { contains: "Lagos", mode: "insensitive" } },
                  { beds: { gte: 3 } },
                ],
              },
            ],
          },
        }),
      );
    });

    it("applies price range and buildType filters", async () => {
      await service.findAll(
        {
          minPrice: 10_000_000,
          maxPrice: 50_000_000,
          buildType: "detached",
        },
        buyerActor,
      );

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              publiclyVisibleWhere(),
              {
                AND: [
                  { price: { gte: 10_000_000 } },
                  { price: { lte: 50_000_000 } },
                  { buildType: { equals: "detached", mode: "insensitive" } },
                ],
              },
            ],
          },
        }),
      );
    });

    it("honours explicit status for staff alongside search filters", async () => {
      await service.findAll(
        {
          status: ListingStatus.VERIFIED,
          minBeds: 2,
        },
        staffActor,
      );

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [{ status: ListingStatus.VERIFIED }, { beds: { gte: 2 } }],
          },
        }),
      );
    });

    it("defaults buyers to publicly visible listings when status is omitted", async () => {
      await service.findAll({}, buyerActor);

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: publiclyVisibleWhere(),
        }),
      );
    });

    it("defaults anonymous users to publicly visible listings", async () => {
      await service.findAll({}, null);

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: publiclyVisibleWhere(),
        }),
      );
    });
  });

  describe("getListingAnalytics", () => {
    it("returns save and transaction counts for seller", async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: "listing-1",
        sellerId: sellerActor.sub,
      });
      prisma.savedProperty.count.mockResolvedValue(3);
      prisma.transaction.count.mockResolvedValue(2);
      prisma.dueDiligenceOrder.count.mockResolvedValue(1);

      const result = await service.getListingAnalytics("listing-1", sellerActor);

      expect(result).toEqual({
        views: 0,
        saves: 3,
        transactionCount: 2,
        ddPurchases: 1,
      });
    });
  });

  describe("resolveListingStatusFromVerificationSteps", () => {
    it("returns LIVE when every step is accepted or completed", () => {
      const steps = [
        { order: 0, status: VerificationStepStatus.COMPLETED },
        { order: 1, status: VerificationStepStatus.ACCEPTED },
      ];
      expect(service.resolveListingStatusFromVerificationSteps(ListingStatus.IN_VERIFICATION, steps)).toBe(
        ListingStatus.LIVE,
      );
    });

    it("returns IN_VERIFICATION when non-submission work has started", () => {
      const steps = [
        { order: 0, status: VerificationStepStatus.COMPLETED },
        { order: 1, status: VerificationStepStatus.IN_PROGRESS },
      ];
      expect(service.resolveListingStatusFromVerificationSteps(ListingStatus.ASSIGNED, steps)).toBe(
        ListingStatus.IN_VERIFICATION,
      );
    });

    it("returns ASSIGNED for pending review listings with no verification work yet", () => {
      const steps = [
        { order: 0, status: VerificationStepStatus.COMPLETED },
        { order: 1, status: VerificationStepStatus.PENDING },
      ];
      expect(
        service.resolveListingStatusFromVerificationSteps(ListingStatus.PENDING_REVIEW, steps),
      ).toBe(ListingStatus.ASSIGNED);
    });
  });

  describe("syncListingStatusFromVerification", () => {
    it("advances listing to LIVE when all steps are done", async () => {
      const listingRow = {
        ...baseListing,
        status: ListingStatus.IN_VERIFICATION,
        verifiedAt: null,
      };
      prisma.listing.findUnique.mockResolvedValue(listingRow);
      prisma.verificationStep.findMany.mockResolvedValue([
        { order: 0, status: VerificationStepStatus.COMPLETED },
        { order: 1, status: VerificationStepStatus.ACCEPTED },
      ]);
      prisma.listing.update.mockResolvedValue({
        ...listingRow,
        status: ListingStatus.LIVE,
        isPublished: true,
        verifiedAt: new Date("2026-06-08T12:00:00.000Z"),
      });

      const result = await service.syncListingStatusFromVerification("listing-1", "staff-1");

      expect(result).toBe(ListingStatus.LIVE);
      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: "listing-1" },
        data: expect.objectContaining({
          status: ListingStatus.LIVE,
          isPublished: true,
          verifiedAt: expect.any(Date),
        }),
      });
      expect(notifications.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LISTING_STATUS_CHANGED,
          after: { status: ListingStatus.LIVE },
        }),
      );
    });

    it("does not change terminal listing statuses", async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...baseListing,
        status: ListingStatus.LIVE,
      });

      const result = await service.syncListingStatusFromVerification("listing-1", "staff-1");

      expect(result).toBe(ListingStatus.LIVE);
      expect(prisma.listing.update).not.toHaveBeenCalled();
    });
  });
});
