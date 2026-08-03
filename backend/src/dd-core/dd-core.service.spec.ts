import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { Prisma, TransactionStatus, UserRole } from "@prisma/client";
import { DdCoreService } from "./dd-core.service";
import { DdCaseSerializer, type DdOrderWithRelations } from "./dd-case.serializer";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { DdCmsService } from "../dd-cms/dd-cms.service";
import { DD_ORDER_STATUS, LISTING_DD_TRANSITIONS, type DdOrderStatus } from "./dd-case.constants";

const ALL_STATUSES = Object.values(DD_ORDER_STATUS);

/** A model stand-in: a bag of jest mocks under the method names this file exercises. */
type ModelDouble = Record<string, jest.Mock>;

interface PrismaDouble {
  dueDiligenceOrder: ModelDouble;
  dueDiligenceAssignment: ModelDouble;
  transaction: ModelDouble;
  user: ModelDouble;
  serviceRequest: ModelDouble;
  serviceBundle: ModelDouble;
  serviceCatalogItem: ModelDouble;
  $transaction: jest.Mock;
}

/**
 * The fixture builds a partial row and asserts it is the whole one.
 *
 * A case carries about thirty columns and any one test cares about four of them. Spelling out the
 * other twenty-six in every fixture call to say nothing about them buys no safety and hides what
 * the test is actually testing, so the cast sits here once instead of at every call site.
 */
function orderFixture(overrides: Record<string, unknown> = {}): DdOrderWithRelations {
  return {
    id: "order-1",
    serviceId: "SBR-SRV-BUY-20260717-001",
    caseId: "SBR-CASE-DD-LOS-20260717-001",
    source: "LISTING",
    status: DD_ORDER_STATUS.PAID,
    buyerId: "buyer-1",
    bundleId: null,
    itemIds: [],
    checklistSelections: {},
    subtotal: new Prisma.Decimal(350000),
    vatAmount: new Prisma.Decimal(26250),
    total: new Prisma.Decimal(376250),
    listingId: "listing-1",
    externalPropertyId: null,
    transactionId: "txn-1",
    verdict: null,
    staffNotes: null,
    completedAt: null,
    reportStorageKeys: [],
    assignments: [],
    listing: null,
    externalProperty: null,
    transaction: null,
    createdAt: new Date("2026-07-17T09:00:00.000Z"),
    updatedAt: new Date("2026-07-17T09:00:00.000Z"),
    ...overrides,
  } as unknown as DdOrderWithRelations;
}

function profileFixture(overrides: Record<string, unknown> = {}) {
  return {
    verifiedStatus: "VERIFIED",
    regulatoryBody: "NBA",
    licenseNumber: "NBA/2019/4412",
    licenseExpiry: new Date("2030-01-01T00:00:00.000Z"),
    licenseDocumentKey: "professionals/licence.pdf",
    idDocumentKey: "professionals/id.pdf",
    rejectionNote: null,
    ...overrides,
  };
}

describe("DdCoreService", () => {
  let service: DdCoreService;
  let prisma: PrismaDouble;
  let storage: { upload: jest.Mock; getSignedUrl: jest.Mock };

  beforeEach(async () => {
    prisma = {
      dueDiligenceOrder: { findUnique: jest.fn(), update: jest.fn() },
      dueDiligenceAssignment: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      transaction: { update: jest.fn() },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      serviceRequest: { findUnique: jest.fn() },
      serviceBundle: { findUnique: jest.fn() },
      serviceCatalogItem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn().mockResolvedValue("/uploads/report.pdf"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DdCoreService,
        DdCaseSerializer,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
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
            ]),
          },
        },
      ],
    }).compile();

    service = module.get(DdCoreService);
  });

  describe("assertTransition, every listing move and every rejected move", () => {
    // The table is the specification, so the test walks it rather than restating it. Every legal
    // move is asserted to pass and every one of the thirty illegal moves is asserted to throw.
    // Restating the pairs by hand would let a row added to the table go untested for ever.
    for (const from of ALL_STATUSES) {
      const allowed = LISTING_DD_TRANSITIONS[from];

      for (const to of allowed) {
        it(`allows ${from} to ${to}`, () => {
          expect(() => service.assertTransition(from, to, LISTING_DD_TRANSITIONS)).not.toThrow();
        });
      }

      const rejected = ALL_STATUSES.filter(
        (candidate) => candidate !== from && !allowed.includes(candidate as DdOrderStatus),
      );
      for (const to of rejected) {
        it(`rejects ${from} to ${to}`, () => {
          expect(() => service.assertTransition(from, to, LISTING_DD_TRANSITIONS)).toThrow(
            BadRequestException,
          );
        });
      }
    }

    it("treats a move to the status already held as a no-op", () => {
      for (const status of ALL_STATUSES) {
        expect(() =>
          service.assertTransition(status, status, LISTING_DD_TRANSITIONS),
        ).not.toThrow();
      }
    });

    it("says what the legal targets were when it refuses a move", () => {
      expect(() =>
        service.assertTransition(
          DD_ORDER_STATUS.PAID,
          DD_ORDER_STATUS.COMPLETE,
          LISTING_DD_TRANSITIONS,
        ),
      ).toThrow("From PAID it can only move to IN_PROGRESS or CANCELLED");
    });

    it("says a terminal case is final rather than listing an empty set of targets", () => {
      expect(() =>
        service.assertTransition(
          DD_ORDER_STATUS.COMPLETE,
          DD_ORDER_STATUS.IN_PROGRESS,
          LISTING_DD_TRANSITIONS,
        ),
      ).toThrow("A complete due diligence case is final and cannot move to IN_PROGRESS");
    });
  });

  describe("assertVerdictOnCompletion", () => {
    it("accepts a verdict supplied with the request", () => {
      expect(() => service.assertVerdictOnCompletion(null, "Title is clean")).not.toThrow();
    });

    it("accepts a verdict already recorded on the case", () => {
      expect(() => service.assertVerdictOnCompletion("Title is clean", undefined)).not.toThrow();
    });

    it("refuses a completion with no verdict anywhere", () => {
      expect(() => service.assertVerdictOnCompletion(null, undefined)).toThrow(
        "Verdict is required when completing a due diligence case",
      );
    });

    it("refuses a verdict that is only whitespace", () => {
      expect(() => service.assertVerdictOnCompletion(null, "   ")).toThrow(BadRequestException);
    });
  });

  describe("resolveAssignableProfessional", () => {
    it("accepts a verified professional", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "pro-1",
        firstName: "Ada",
        lastName: "Nwosu",
        role: UserRole.PROFESSIONAL,
        professionalProfile: profileFixture(),
      });

      const result = await service.resolveAssignableProfessional("pro-1");
      expect(result).toEqual({
        ok: true,
        professional: { id: "pro-1", firstName: "Ada", lastName: "Nwosu" },
      });
    });

    it("refuses a user who is not a professional", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "buyer-1",
        firstName: "Tunde",
        lastName: "Bello",
        role: UserRole.BUYER,
        professionalProfile: null,
      });

      const result = await service.resolveAssignableProfessional("buyer-1");
      expect(result).toEqual({ ok: false, reason: "professionalId must be a professional" });
    });

    it("refuses an id that resolves to nobody", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.resolveAssignableProfessional("ghost");
      expect(result).toEqual({ ok: false, reason: "professionalId must be a professional" });
    });

    it("names the rejection note when the profile was rejected", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "pro-2",
        firstName: "Ada",
        lastName: "Nwosu",
        role: UserRole.PROFESSIONAL,
        professionalProfile: profileFixture({
          verifiedStatus: "REJECTED",
          rejectionNote: "Licence belongs to a different practice",
        }),
      });

      const result = await service.resolveAssignableProfessional("pro-2");
      expect(result).toEqual({
        ok: false,
        reason: "Ada Nwosu failed verification: Licence belongs to a different practice",
      });
    });

    it("names the documents still missing from an unverified profile", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "pro-3",
        firstName: "Ada",
        lastName: "Nwosu",
        role: UserRole.PROFESSIONAL,
        professionalProfile: profileFixture({
          verifiedStatus: "PENDING",
          licenseDocumentKey: null,
          idDocumentKey: null,
        }),
      });

      const result = await service.resolveAssignableProfessional("pro-3");
      expect(result).toEqual({
        ok: false,
        reason:
          "Ada Nwosu is not verified and the profile is still missing a practising licence document and an identity document",
      });
    });

    it("reports an expired licence by number, body and date", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "pro-4",
        firstName: "Ada",
        lastName: "Nwosu",
        role: UserRole.PROFESSIONAL,
        professionalProfile: profileFixture({
          verifiedStatus: "PENDING",
          licenseExpiry: new Date("2020-03-04T00:00:00.000Z"),
        }),
      });

      const result = await service.resolveAssignableProfessional("pro-4");
      expect(result).toEqual({
        ok: false,
        reason:
          "Ada Nwosu is not verified, and licence NBA/2019/4412 with NBA expired on 2020-03-04",
      });
    });

    it("reports a complete profile as awaiting verification", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "pro-5",
        firstName: "Ada",
        lastName: "Nwosu",
        role: UserRole.PROFESSIONAL,
        professionalProfile: profileFixture({ verifiedStatus: "PENDING" }),
      });

      const result = await service.resolveAssignableProfessional("pro-5");
      expect(result).toEqual({
        ok: false,
        reason: "Ada Nwosu is awaiting verification of licence NBA/2019/4412 with NBA",
      });
    });

    it("reports a professional with no profile at all", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "pro-6",
        firstName: "Ada",
        lastName: "Nwosu",
        role: UserRole.PROFESSIONAL,
        professionalProfile: null,
      });

      const result = await service.resolveAssignableProfessional("pro-6");
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toContain(
        "has no professional profile on record",
      );
    });
  });

  describe("createAssignment", () => {
    beforeEach(() => {
      prisma.dueDiligenceAssignment.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: "assign-1", ...data }),
      );
    });

    it("moves a paid case into progress and carries the transaction with it", async () => {
      const order = orderFixture({ status: DD_ORDER_STATUS.PAID });

      await service.createAssignment(order, "pro-1", {
        professionalId: "pro-1",
        scheduleCode: "legal_check",
      });

      expect(prisma.dueDiligenceOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { status: DD_ORDER_STATUS.IN_PROGRESS },
      });
      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: "txn-1" },
        data: { status: TransactionStatus.DD_IN_PROGRESS },
      });
    });

    it("leaves a case already in progress where it is", async () => {
      const order = orderFixture({ status: DD_ORDER_STATUS.IN_PROGRESS });

      await service.createAssignment(order, "pro-1", {
        professionalId: "pro-1",
        scheduleCode: "LEGAL_CHECK",
      });

      expect(prisma.dueDiligenceOrder.update).not.toHaveBeenCalled();
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it("upper-cases the schedule code and builds a title when none is given", async () => {
      const assignment = await service.createAssignment(orderFixture(), "pro-1", {
        professionalId: "pro-1",
        scheduleCode: " legal_check ",
      });

      expect(assignment.scheduleCode).toBe("LEGAL_CHECK");
      expect(assignment.title).toBe("Due diligence — LEGAL CHECK (SBR-SRV-BUY-20260717-001)");
    });

    it("keeps the title the operator supplied", async () => {
      const assignment = await service.createAssignment(orderFixture(), "pro-1", {
        professionalId: "pro-1",
        scheduleCode: "LEGAL_CHECK",
        title: "  Root of title search  ",
      });

      expect(assignment.title).toBe("Root of title search");
    });
  });

  describe("applyStatusChange", () => {
    it("writes only the fields the caller supplied", async () => {
      await service.applyStatusChange(orderFixture({ verdict: "Title is clean" }), {
        staffNotes: "Chased the survey plan",
      });

      expect(prisma.dueDiligenceOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { staffNotes: "Chased the survey plan" },
      });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it("stamps completedAt and closes the transaction on completion", async () => {
      await service.applyStatusChange(orderFixture({ status: DD_ORDER_STATUS.IN_PROGRESS }), {
        status: DD_ORDER_STATUS.COMPLETE,
        verdict: "Title is clean",
      });

      const data = prisma.dueDiligenceOrder.update.mock.calls[0][0].data;
      expect(data.status).toBe(DD_ORDER_STATUS.COMPLETE);
      expect(data.verdict).toBe("Title is clean");
      expect(data.completedAt).toBeInstanceOf(Date);
      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: "txn-1" },
        data: { status: TransactionStatus.DD_COMPLETE },
      });
    });

    it("blanks a verdict that was explicitly sent as empty", async () => {
      await service.applyStatusChange(orderFixture({ verdict: "Old" }), { verdict: "  " });

      expect(prisma.dueDiligenceOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { verdict: null },
      });
    });
  });

  describe("attachAssignmentReport", () => {
    it("marks the assignment submitted and appends the key to the case in one transaction", async () => {
      const order = orderFixture({
        status: DD_ORDER_STATUS.PAID,
        reportStorageKeys: ["due-diligence/order-1/reports/earlier.pdf"],
      });

      const key = await service.attachAssignmentReport(order, { id: "assign-1" }, {
        originalname: "survey report.pdf",
        buffer: Buffer.from("pdf"),
        mimetype: "application/pdf",
      } as Express.Multer.File);

      expect(storage.upload).toHaveBeenCalledTimes(1);
      expect(key).toContain("due-diligence/order-1/assignments/assign-1/");
      expect(key).toContain("survey_report.pdf");

      // Both writes go into one $transaction call. A report that marked the assignment submitted
      // but failed to reach the case would leave the professional believing they had delivered.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
      expect(prisma.dueDiligenceAssignment.update).toHaveBeenCalledWith({
        where: { id: "assign-1" },
        data: { reportStorageKey: key, status: "SUBMITTED" },
      });
      expect(prisma.dueDiligenceOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: {
          reportStorageKeys: ["due-diligence/order-1/reports/earlier.pdf", key],
          status: DD_ORDER_STATUS.IN_PROGRESS,
        },
      });
    });

    it("refuses an upload with no file", async () => {
      await expect(
        service.attachAssignmentReport(orderFixture(), { id: "assign-1" }, undefined as never),
      ).rejects.toThrow("Report file is required");
    });
  });
});
