import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PlatformConfigService } from "../platform-config/platform-config.service";
import { NotificationsService } from "../notifications/notifications.service";
import { KycService } from "./kyc.service";
import { KycStatus } from "./kyc.constants";

const baseRecord = {
  id: "kyc-1",
  userId: "buyer-1",
  status: KycStatus.NOT_SUBMITTED,
  documentKeys: [] as string[],
  reviewerId: null as string | null,
  reviewNote: null as string | null,
  submittedAt: null as Date | null,
  reviewedAt: null as Date | null,
  createdAt: new Date("2026-05-27T10:00:00.000Z"),
  updatedAt: new Date("2026-05-27T10:00:00.000Z"),
};

describe("KycService", () => {
  let service: KycService;
  let prisma: {
    kycRecord: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
  };
  let storage: { upload: jest.Mock; getSignedUrl: jest.Mock };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-27T15:00:00.000Z"));
    prisma = {
      kycRecord: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };
    storage = {
      upload: jest.fn().mockResolvedValue("kyc/buyer-1/id.pdf"),
      getSignedUrl: jest.fn().mockResolvedValue("/uploads/kyc/buyer-1/id.pdf"),
    };
    notifications = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        {
          provide: PlatformConfigService,
          useValue: { getMaxUploadBytes: jest.fn().mockResolvedValue(15 * 1024 * 1024) },
        },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(KycService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("getMy returns NOT_SUBMITTED when no record exists", async () => {
    prisma.kycRecord.findUnique.mockResolvedValue(null);
    const result = await service.getMy("buyer-1");
    expect(result.status).toBe(KycStatus.NOT_SUBMITTED);
    expect(result.documentKeys).toEqual([]);
    expect(result.userId).toBe("buyer-1");
  });

  it("submit upserts record with SUBMITTED status and document keys", async () => {
    prisma.kycRecord.findUnique.mockResolvedValue(null);
    prisma.kycRecord.upsert.mockResolvedValue({
      ...baseRecord,
      status: KycStatus.SUBMITTED,
      documentKeys: ["kyc/buyer-1/id.pdf", "kyc/buyer-1/selfie.jpg"],
      submittedAt: new Date("2026-05-27T15:00:00.000Z"),
    });

    const result = await service.submit("buyer-1", {
      documentKeys: ["kyc/buyer-1/id.pdf", "kyc/buyer-1/selfie.jpg"],
    });

    expect(prisma.kycRecord.upsert).toHaveBeenCalledWith({
      where: { userId: "buyer-1" },
      create: expect.objectContaining({
        userId: "buyer-1",
        status: KycStatus.SUBMITTED,
        documentKeys: ["kyc/buyer-1/id.pdf", "kyc/buyer-1/selfie.jpg"],
        submittedAt: new Date("2026-05-27T15:00:00.000Z"),
      }),
      update: expect.objectContaining({
        status: KycStatus.SUBMITTED,
        reviewerId: null,
        reviewNote: null,
        reviewedAt: null,
      }),
    });
    expect(result.status).toBe(KycStatus.SUBMITTED);
  });

  it("submit rejects when status is already SUBMITTED", async () => {
    prisma.kycRecord.findUnique.mockResolvedValue({
      ...baseRecord,
      status: KycStatus.SUBMITTED,
    });
    await expect(
      service.submit("buyer-1", { documentKeys: ["kyc/buyer-1/id.pdf"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("submit rejects when status is VERIFIED", async () => {
    prisma.kycRecord.findUnique.mockResolvedValue({
      ...baseRecord,
      status: KycStatus.VERIFIED,
    });
    await expect(
      service.submit("buyer-1", { documentKeys: ["kyc/buyer-1/id.pdf"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("upload stores file under kyc/{userId}/ prefix", async () => {
    const file = {
      originalname: "passport.pdf",
      mimetype: "application/pdf",
      size: 1024,
      buffer: Buffer.from("pdf"),
    } as Express.Multer.File;

    const result = await service.uploadDocument("buyer-1", file);

    expect(storage.upload).toHaveBeenCalled();
    const [, key] = storage.upload.mock.calls[0];
    expect(key).toMatch(/^kyc\/buyer-1\//);
    expect(result.storageKey).toBe("kyc/buyer-1/id.pdf");
  });

  it("upload rejects files owned by another user prefix on submit", async () => {
    prisma.kycRecord.findUnique.mockResolvedValue(null);
    await expect(
      service.submit("buyer-1", { documentKeys: ["kyc/other-user/id.pdf"] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("listQueue returns SUBMITTED records with user and document URLs", async () => {
    prisma.kycRecord.findMany.mockResolvedValue([
      {
        ...baseRecord,
        status: KycStatus.SUBMITTED,
        documentKeys: ["kyc/buyer-1/id.pdf"],
        submittedAt: new Date("2026-05-27T12:00:00.000Z"),
        user: {
          id: "buyer-1",
          firstName: "Ada",
          lastName: "Buyer",
          email: "buyer@example.com",
        },
      },
    ]);

    const result = await service.listQueue();

    expect(prisma.kycRecord.findMany).toHaveBeenCalledWith({
      where: { status: KycStatus.SUBMITTED },
      orderBy: { submittedAt: "asc" },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].user.email).toBe("buyer@example.com");
    expect(result[0].documents[0].url).toBe("/uploads/kyc/buyer-1/id.pdf");
  });

  it("verify sets status to VERIFIED and notifies the user", async () => {
    prisma.kycRecord.findUnique.mockResolvedValue({
      ...baseRecord,
      status: KycStatus.SUBMITTED,
    });
    prisma.kycRecord.update.mockResolvedValue({
      ...baseRecord,
      status: KycStatus.VERIFIED,
      reviewerId: "staff-1",
      reviewedAt: new Date("2026-05-27T15:00:00.000Z"),
    });

    const result = await service.verify("buyer-1", "staff-1");

    expect(result.status).toBe(KycStatus.VERIFIED);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "buyer-1", type: "KYC_VERIFIED" }),
    );
  });

  it("reject requires note and notifies the user", async () => {
    prisma.kycRecord.findUnique.mockResolvedValue({
      ...baseRecord,
      status: KycStatus.SUBMITTED,
    });
    prisma.kycRecord.update.mockResolvedValue({
      ...baseRecord,
      status: KycStatus.REJECTED,
      reviewerId: "staff-1",
      reviewNote: "ID unreadable",
      reviewedAt: new Date("2026-05-27T15:00:00.000Z"),
    });

    const result = await service.reject("buyer-1", "staff-1", "ID unreadable");

    expect(result.status).toBe(KycStatus.REJECTED);
    expect(result.reviewNote).toBe("ID unreadable");
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "buyer-1", type: "KYC_REJECTED" }),
    );
  });

  it("verify throws when record is missing", async () => {
    prisma.kycRecord.findUnique.mockResolvedValue(null);
    await expect(service.verify("missing", "staff-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("verify throws when record is not SUBMITTED", async () => {
    prisma.kycRecord.findUnique.mockResolvedValue({
      ...baseRecord,
      status: KycStatus.NOT_SUBMITTED,
    });
    await expect(service.verify("buyer-1", "staff-1")).rejects.toBeInstanceOf(BadRequestException);
  });
});
