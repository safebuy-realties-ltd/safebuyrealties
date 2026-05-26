import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  UserRole,
  VerificationStepStatus,
  VerificationStepType,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VerificationService } from "./verification.service";
import { JwtPayload } from "../auth/jwt.strategy";

const staff: JwtPayload = {
  sub: "staff-1",
  email: "staff@example.com",
  role: UserRole.STAFF,
  professionalType: null,
};
const admin: JwtPayload = {
  sub: "admin-1",
  email: "admin@example.com",
  role: UserRole.ADMIN,
  professionalType: null,
};
const pro: JwtPayload = {
  sub: "pro-1",
  email: "pro@example.com",
  role: UserRole.PROFESSIONAL,
  professionalType: null,
};

const baseStep = {
  id: "step-1",
  listingId: "listing-1",
  type: VerificationStepType.SUBMISSION,
  status: VerificationStepStatus.COMPLETED,
  assignedProfessionalId: "pro-1",
  notes: null,
  revisionNote: null,
  completedAt: null as Date | null,
  order: 0,
  riskFlags: [] as string[],
};

describe("VerificationService accept / request-revision", () => {
  let service: VerificationService;
  let prisma: {
    verificationStep: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-26T12:00:00.000Z"));
    prisma = {
      verificationStep: {
        findUnique: jest.fn().mockResolvedValue({ ...baseStep }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...baseStep, ...data }),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [VerificationService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(VerificationService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("acceptStep", () => {
    it("transitions to ACCEPTED, sets completedAt and clears revisionNote", async () => {
      const result = await service.acceptStep("step-1", staff);

      expect(prisma.verificationStep.update).toHaveBeenCalledWith({
        where: { id: "step-1" },
        data: {
          status: VerificationStepStatus.ACCEPTED,
          completedAt: new Date("2026-05-26T12:00:00.000Z"),
          revisionNote: null,
        },
      });
      expect(result.status).toBe(VerificationStepStatus.ACCEPTED);
      expect(result.completedAt).toBe("2026-05-26T12:00:00.000Z");
      expect(result.revisionNote).toBeNull();
    });

    it("allows ADMIN actors", async () => {
      await expect(service.acceptStep("step-1", admin)).resolves.toMatchObject({
        status: VerificationStepStatus.ACCEPTED,
      });
    });

    it("forbids non-staff actors", async () => {
      await expect(service.acceptStep("step-1", pro)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.verificationStep.update).not.toHaveBeenCalled();
    });

    it("throws NotFound when step does not exist", async () => {
      prisma.verificationStep.findUnique.mockResolvedValueOnce(null);
      await expect(service.acceptStep("missing", staff)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("requestRevision", () => {
    it("transitions to REVISION_REQUESTED and stores the note", async () => {
      const result = await service.requestRevision("step-1", "Fix the title docs", staff);

      expect(prisma.verificationStep.update).toHaveBeenCalledWith({
        where: { id: "step-1" },
        data: {
          status: VerificationStepStatus.REVISION_REQUESTED,
          revisionNote: "Fix the title docs",
        },
      });
      expect(result.status).toBe(VerificationStepStatus.REVISION_REQUESTED);
      expect(result.revisionNote).toBe("Fix the title docs");
    });

    it("rejects an empty / whitespace note", async () => {
      await expect(service.requestRevision("step-1", "   ", staff)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.verificationStep.update).not.toHaveBeenCalled();
    });

    it("forbids non-staff actors", async () => {
      await expect(service.requestRevision("step-1", "note", pro)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.verificationStep.update).not.toHaveBeenCalled();
    });

    it("throws NotFound when step does not exist", async () => {
      prisma.verificationStep.findUnique.mockResolvedValueOnce(null);
      await expect(service.requestRevision("missing", "note", staff)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
