import { Test, TestingModule } from "@nestjs/testing";
import { ListingStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ListingsService } from "./listings.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { UserRole } from "@prisma/client";

const sellerActor: JwtPayload = {
  sub: "seller-1",
  email: "seller@safebuyrealties.test",
  role: UserRole.SELLER,
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
  status: ListingStatus.DRAFT,
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
      type: "hero",
      sortOrder: 0,
      createdAt: new Date("2026-01-15T11:00:00.000Z"),
    },
    {
      id: "media-2",
      listingId: "listing-1",
      storageKey: "listings/listing-1/gallery-1.jpg",
      type: "gallery",
      sortOrder: 1,
      createdAt: new Date("2026-01-15T11:01:00.000Z"),
    },
  ],
};

describe("ListingsService", () => {
  let service: ListingsService;
  let prisma: {
    listing: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      listing: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ListingsService);
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
});
