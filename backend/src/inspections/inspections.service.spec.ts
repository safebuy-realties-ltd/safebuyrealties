import { Test, TestingModule } from "@nestjs/testing";
import { ListingStatus, UserRole } from "@prisma/client";
import { InspectionsService } from "./inspections.service";
import { PrismaService } from "../prisma/prisma.service";

const buyer = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};

describe("InspectionsService", () => {
  let service: InspectionsService;
  const prisma = {
    listing: { findUnique: jest.fn() },
    inspectionSlot: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [InspectionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(InspectionsService);
  });

  it("creates inspection request for LIVE listing", async () => {
    prisma.listing.findUnique.mockResolvedValue({ id: "l1", status: ListingStatus.LIVE });
    prisma.inspectionSlot.create.mockResolvedValue({
      id: "s1",
      listingId: "l1",
      professionalId: null,
      requestedById: buyer.sub,
      scheduledAt: new Date("2026-06-01T10:00:00Z"),
      status: "REQUESTED",
      outcome: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createForListing(
      "l1",
      { scheduledAt: "2026-06-01T10:00:00.000Z" },
      buyer,
    );

    expect(result.status).toBe("REQUESTED");
    expect(prisma.inspectionSlot.create).toHaveBeenCalled();
  });
});
