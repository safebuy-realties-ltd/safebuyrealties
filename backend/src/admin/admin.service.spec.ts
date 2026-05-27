import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import { AdminService } from "./admin.service";
import { PrismaService } from "../prisma/prisma.service";

const adminActor = {
  sub: "admin-1",
  email: "admin@safebuyrealties.test",
  role: UserRole.ADMIN,
  professionalType: null,
};

describe("AdminService", () => {
  let service: AdminService;
  const prisma = {
    listing: { count: jest.fn() },
    transaction: { count: jest.fn() },
    dueDiligenceOrder: { aggregate: jest.fn() },
    kycRecord: { count: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.listing.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    prisma.transaction.count.mockResolvedValue(7);
    prisma.dueDiligenceOrder.aggregate.mockResolvedValue({
      _sum: { total: "1500000" },
    });
    prisma.kycRecord.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminService);
  });

  it("returns platform analytics for admin", async () => {
    const result = await service.getAnalytics(adminActor);
    expect(result.totalListings).toBe(10);
    expect(result.liveListings).toBe(4);
    expect(result.totalTransactions).toBe(7);
    expect(result.pendingVerifications).toBe(2);
    expect(result.pendingKyc).toBe(1);
  });
});
