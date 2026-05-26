import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { ProfessionalsService } from "./professionals.service";

const baseProfile = {
  id: "profile-1",
  userId: "user-1",
  regulatoryBody: "NBA",
  licenseNumber: "LIC-123",
  licenseExpiry: new Date("2027-01-01T00:00:00.000Z"),
  verifiedStatus: "PENDING",
  verifiedById: null as string | null,
  verifiedAt: null as Date | null,
  rejectionNote: null as string | null,
  createdAt: new Date("2026-05-26T12:00:00.000Z"),
  updatedAt: new Date("2026-05-26T12:00:00.000Z"),
};

describe("ProfessionalsService", () => {
  let service: ProfessionalsService;
  let prisma: {
    professionalProfile: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-26T15:00:00.000Z"));
    prisma = {
      professionalProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProfessionalsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ProfessionalsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns null when the professional has no profile", async () => {
    prisma.professionalProfile.findUnique.mockResolvedValue(null);
    expect(await service.getMyProfile("user-1")).toBeNull();
  });

  it("upsert resets verification state to PENDING and clears reviewer fields", async () => {
    prisma.professionalProfile.upsert.mockResolvedValue({ ...baseProfile });

    await service.upsertMyProfile("user-1", {
      regulatoryBody: "NBA",
      licenseNumber: "LIC-123",
      licenseExpiry: "2027-01-01T00:00:00.000Z",
    });

    const expectedData = {
      regulatoryBody: "NBA",
      licenseNumber: "LIC-123",
      licenseExpiry: new Date("2027-01-01T00:00:00.000Z"),
      verifiedStatus: "PENDING",
      verifiedById: null,
      verifiedAt: null,
      rejectionNote: null,
    };
    expect(prisma.professionalProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1", ...expectedData },
      update: expectedData,
    });
  });

  it("verify approves and stamps the reviewer", async () => {
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...baseProfile });
    prisma.professionalProfile.update.mockResolvedValue({
      ...baseProfile,
      verifiedStatus: "VERIFIED",
      verifiedById: "staff-1",
      verifiedAt: new Date("2026-05-26T15:00:00.000Z"),
    });

    const result = await service.verify("profile-1", { approve: true }, "staff-1");

    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: {
        verifiedStatus: "VERIFIED",
        verifiedById: "staff-1",
        verifiedAt: new Date("2026-05-26T15:00:00.000Z"),
        rejectionNote: null,
      },
    });
    expect(result.verifiedStatus).toBe("VERIFIED");
    expect(result.verifiedById).toBe("staff-1");
  });

  it("verify rejects with a rejection note", async () => {
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...baseProfile });
    prisma.professionalProfile.update.mockResolvedValue({
      ...baseProfile,
      verifiedStatus: "REJECTED",
      verifiedById: "staff-1",
      verifiedAt: new Date("2026-05-26T15:00:00.000Z"),
      rejectionNote: "License expired",
    });

    const result = await service.verify(
      "profile-1",
      { approve: false, rejectionNote: "License expired" },
      "staff-1",
    );

    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: {
        verifiedStatus: "REJECTED",
        verifiedById: "staff-1",
        verifiedAt: new Date("2026-05-26T15:00:00.000Z"),
        rejectionNote: "License expired",
      },
    });
    expect(result.verifiedStatus).toBe("REJECTED");
    expect(result.rejectionNote).toBe("License expired");
  });

  it("verify throws when the profile does not exist", async () => {
    prisma.professionalProfile.findUnique.mockResolvedValue(null);
    await expect(service.verify("missing", { approve: true }, "staff-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("listPending filters by PENDING status and includes user details", async () => {
    prisma.professionalProfile.findMany.mockResolvedValue([
      {
        ...baseProfile,
        user: {
          id: "user-1",
          firstName: "Ada",
          lastName: "Obi",
          email: "ada@example.com",
          professionalType: "LAWYER",
        },
      },
    ]);

    const result = await service.listPending();

    expect(prisma.professionalProfile.findMany).toHaveBeenCalledWith({
      where: { verifiedStatus: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            professionalType: true,
          },
        },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].user.email).toBe("ada@example.com");
    expect(result[0].verifiedStatus).toBe("PENDING");
  });
});
