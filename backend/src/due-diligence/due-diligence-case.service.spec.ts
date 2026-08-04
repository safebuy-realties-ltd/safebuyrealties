import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, ProfessionalType, TransactionStatus, UserRole } from "@prisma/client";
import { DueDiligenceCaseService } from "./due-diligence-case.service";
import { DdCoreService } from "../dd-core/dd-core.service";
import {
  DdCaseSerializer,
  type DdAssignmentWithProfessional,
  type DdOrderWithRelations,
} from "../dd-core/dd-case.serializer";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { DdCmsService } from "../dd-cms/dd-cms.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../audit/audit.service";
import { DocumentGrantService } from "../storage/document-grant.service";
import { TransactionStateService } from "../transactions/transaction-state.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { NotificationType } from "../notifications/notification-types.constants";
import { DD_ORDER_STATUS, DD_SOURCE } from "../dd-core/dd-case.constants";

const buyer = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};
const otherBuyer = { ...buyer, sub: "buyer-2" };
const staff = {
  sub: "staff-1",
  email: "ops@safebuyrealties.test",
  role: UserRole.STAFF,
  professionalType: null,
};
const professional = {
  sub: "pro-1",
  email: "ada@chambers.test",
  role: UserRole.PROFESSIONAL,
  professionalType: ProfessionalType.LAWYER,
};

/** A model stand-in: a bag of jest mocks under the method names this file exercises. */
type ModelDouble = Record<string, jest.Mock>;

interface PrismaDouble {
  dueDiligenceOrder: ModelDouble;
  dueDiligenceAssignment: ModelDouble;
  transaction: ModelDouble;
  user: ModelDouble;
  listing: ModelDouble;
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
function caseFixture(overrides: Record<string, unknown> = {}): DdOrderWithRelations {
  return {
    id: "order-1",
    serviceId: "SBR-SRV-BUY-20260717-001",
    caseId: "SBR-CASE-DD-LOS-20260717-001",
    source: DD_SOURCE.LISTING,
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
    listing: {
      id: "listing-1",
      title: "3 bedroom flat, Lekki Phase 1",
      location: "Lekki, Lagos",
      propertyId: "SBR-PRP-LOS-20260717-001",
      currency: "NGN",
    },
    externalProperty: null,
    transaction: null,
    createdAt: new Date("2026-07-17T09:00:00.000Z"),
    updatedAt: new Date("2026-07-17T09:00:00.000Z"),
    ...overrides,
  } as unknown as DdOrderWithRelations;
}

function assignmentFixture(overrides: Record<string, unknown> = {}): DdAssignmentWithProfessional {
  return {
    id: "assign-1",
    dueDiligenceOrderId: "order-1",
    professionalId: "pro-1",
    scheduleCode: "LEGAL_CHECK",
    title: "Schedule A legal review",
    status: "PENDING",
    notes: null,
    reportStorageKey: null,
    professional: {
      id: "pro-1",
      email: "ada@chambers.test",
      firstName: "Ada",
      lastName: "Nwosu",
      professionalType: "LAWYER",
    },
    createdAt: new Date("2026-07-17T10:00:00.000Z"),
    updatedAt: new Date("2026-07-17T10:00:00.000Z"),
    ...overrides,
  } as unknown as DdAssignmentWithProfessional;
}

const pdf = {
  originalname: "legal report.pdf",
  buffer: Buffer.from("pdf"),
  mimetype: "application/pdf",
} as Express.Multer.File;

describe("DueDiligenceCaseService", () => {
  let service: DueDiligenceCaseService;
  let prisma: PrismaDouble;
  let notifications: { create: jest.Mock; createForStaff: jest.Mock };
  let audit: { log: jest.Mock };

  /** Every recipient of a participant notification, in the order they were told. */
  const notifiedUserIds = () =>
    notifications.create.mock.calls.map((call) => call[0].userId as string);

  beforeEach(async () => {
    prisma = {
      dueDiligenceOrder: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      dueDiligenceAssignment: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      transaction: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      listing: { findUnique: jest.fn().mockResolvedValue({ sellerId: "seller-1" }) },
      serviceRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      serviceBundle: { findUnique: jest.fn() },
      serviceCatalogItem: { findMany: jest.fn().mockResolvedValue([]) },
      // The interactive form hands the callback a client to write through. The double runs the
      // callback against itself, so a test reads the same mocks either way. `list` overrides this
      // with its own paged result, which is why the array form still has to work.
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === "function"
          ? (arg as (db: unknown) => Promise<unknown>)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    notifications = { create: jest.fn(), createForStaff: jest.fn() };
    audit = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DueDiligenceCaseService,
        DdCoreService,
        DdCaseSerializer,
        TransactionStateService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StorageService,
          useValue: {
            upload: jest.fn().mockResolvedValue(undefined),
            getSignedUrl: jest.fn().mockResolvedValue("/uploads/report.pdf"),
          },
        },
        {
          provide: DdCmsService,
          useValue: {
            getActiveDefinitions: jest.fn().mockResolvedValue([]),
            suggestedTypesForSchedules: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: NotificationsService, useValue: notifications },
        { provide: AuditService, useValue: audit },
        // The real grant service. It signs with the development secret here and holds nothing else,
        // so a stub would only make the report tests assert against a fiction.
        DocumentGrantService,
      ],
    }).compile();

    service = module.get(DueDiligenceCaseService);
  });

  describe("list, the case queue", () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation(async () => [1, [caseFixture()]]);
    });

    it("shows a buyer their own listing cases and nobody else's", async () => {
      await service.list({ page: 1, pageSize: 20 }, buyer);

      const [countArgs] = prisma.dueDiligenceOrder.count.mock.calls[0];
      expect(countArgs.where).toEqual({ source: DD_SOURCE.LISTING, buyerId: "buyer-1" });
    });

    it("shows an operator every listing case", async () => {
      await service.list({ page: 1, pageSize: 20 }, staff);

      const [countArgs] = prisma.dueDiligenceOrder.count.mock.calls[0];
      expect(countArgs.where).toEqual({ source: DD_SOURCE.LISTING });
    });

    it("never reaches outside the listing source, whoever is asking", async () => {
      await service.list({}, staff);
      const [findArgs] = prisma.dueDiligenceOrder.findMany.mock.calls[0];
      expect(findArgs.where.source).toBe(DD_SOURCE.LISTING);
    });

    it("filters by status when one is given", async () => {
      await service.list({ status: DD_ORDER_STATUS.IN_PROGRESS }, staff);

      const [countArgs] = prisma.dueDiligenceOrder.count.mock.calls[0];
      expect(countArgs.where.status).toBe(DD_ORDER_STATUS.IN_PROGRESS);
    });

    it("pages from one and reports the page it served", async () => {
      const result = await service.list({ page: 3, pageSize: 5 }, staff);

      const [findArgs] = prisma.dueDiligenceOrder.findMany.mock.calls[0];
      expect(findArgs.skip).toBe(10);
      expect(findArgs.take).toBe(5);
      expect(result.meta).toEqual({ page: 3, pageSize: 5, total: 1 });
    });

    it("defaults to the first page of twenty", async () => {
      const result = await service.list({}, staff);

      const [findArgs] = prisma.dueDiligenceOrder.findMany.mock.calls[0];
      expect(findArgs.skip).toBe(0);
      expect(findArgs.take).toBe(20);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });
  });

  describe("getOne, reading a single case", () => {
    it("serves the buyer who owns it", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());

      const result = await service.getOne("order-1", buyer);
      expect(result.id).toBe("order-1");
      expect(result.status).toBe(DD_ORDER_STATUS.PAID);
    });

    it("serves an operator", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());

      const result = await service.getOne("order-1", staff);
      expect(result.id).toBe("order-1");
    });

    it("gives another buyer a 404 rather than a 403", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());

      await expect(service.getOne("order-1", otherBuyer)).rejects.toThrow(NotFoundException);
    });

    it("does not serve a standalone case through the listing route", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({ source: DD_SOURCE.STANDALONE }),
      );

      await expect(service.getOne("order-1", staff)).rejects.toThrow(NotFoundException);
    });

    it("keeps the seller out of the response", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());

      const result = await service.getOne("order-1", buyer);
      expect(JSON.stringify(result)).not.toContain("seller-1");
    });
  });

  describe("assign, putting a professional on a schedule", () => {
    beforeEach(() => {
      prisma.dueDiligenceAssignment.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: "assign-1", ...data }),
      );
      prisma.user.findUnique.mockResolvedValue({
        id: "pro-1",
        firstName: "Ada",
        lastName: "Nwosu",
        role: UserRole.PROFESSIONAL,
        professionalProfile: {
          verifiedStatus: "VERIFIED",
          regulatoryBody: "NBA",
          licenseNumber: "NBA/2019/4412",
          licenseExpiry: new Date("2030-01-01T00:00:00.000Z"),
          licenseDocumentKey: "professionals/licence.pdf",
          idDocumentKey: "professionals/id.pdf",
          rejectionNote: null,
        },
      });
    });

    it("refuses a case that has not been paid for", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({ status: DD_ORDER_STATUS.PENDING }),
      );

      await expect(
        service.assign("order-1", { professionalId: "pro-1", scheduleCode: "LEGAL_CHECK" }, staff),
      ).rejects.toThrow("A due diligence case cannot be assigned before it is paid for");
    });

    it("refuses a completed case", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({ status: DD_ORDER_STATUS.COMPLETE, verdict: "Title is clean" }),
      );

      await expect(
        service.assign("order-1", { professionalId: "pro-1", scheduleCode: "LEGAL_CHECK" }, staff),
      ).rejects.toThrow("A complete due diligence case cannot take new assignments");
    });

    it("refuses a cancelled case", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({ status: DD_ORDER_STATUS.CANCELLED }),
      );

      await expect(
        service.assign("order-1", { professionalId: "pro-1", scheduleCode: "LEGAL_CHECK" }, staff),
      ).rejects.toThrow(BadRequestException);
    });

    it("answers an unverified professional with a 422 naming the missing credential", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());
      prisma.user.findUnique.mockResolvedValue({
        id: "pro-1",
        firstName: "Ada",
        lastName: "Nwosu",
        role: UserRole.PROFESSIONAL,
        professionalProfile: {
          verifiedStatus: "PENDING",
          regulatoryBody: "NBA",
          licenseNumber: "NBA/2019/4412",
          licenseExpiry: null,
          licenseDocumentKey: null,
          idDocumentKey: "professionals/id.pdf",
          rejectionNote: null,
        },
      });

      await expect(
        service.assign("order-1", { professionalId: "pro-1", scheduleCode: "LEGAL_CHECK" }, staff),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.dueDiligenceAssignment.create).not.toHaveBeenCalled();
    });

    it("creates the assignment, moves the case into progress and writes the audit row", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());

      await service.assign(
        "order-1",
        { professionalId: "pro-1", scheduleCode: "LEGAL_CHECK", title: "Schedule A legal review" },
        staff,
      );

      expect(prisma.dueDiligenceOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { status: DD_ORDER_STATUS.IN_PROGRESS },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "staff-1",
          action: AuditAction.DD_CASE_ASSIGNED,
          entity: "DueDiligenceOrder",
          entityId: "order-1",
          before: { status: DD_ORDER_STATUS.PAID },
          after: expect.objectContaining({
            status: DD_ORDER_STATUS.IN_PROGRESS,
            assignmentId: "assign-1",
            professionalId: "pro-1",
            scheduleCode: "LEGAL_CHECK",
          }),
        }),
      );
    });

    it("tells the professional about the work and the buyer and seller about the case", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());

      await service.assign(
        "order-1",
        { professionalId: "pro-1", scheduleCode: "LEGAL_CHECK", title: "Schedule A legal review" },
        staff,
      );

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "pro-1",
          type: NotificationType.TASK_ASSIGNED,
          body: "Schedule A legal review",
        }),
      );
      expect(notifiedUserIds()).toEqual(["pro-1", "buyer-1", "seller-1"]);
    });

    it("does not tell the new assignee twice when they are already on the case", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({
          status: DD_ORDER_STATUS.IN_PROGRESS,
          assignments: [assignmentFixture()],
        }),
      );

      await service.assign(
        "order-1",
        { professionalId: "pro-1", scheduleCode: "PHYSICAL_CHECK" },
        staff,
      );

      const participantCalls = notifications.create.mock.calls
        .map((call) => call[0])
        .filter((payload) => payload.type === NotificationType.DD_CASE_STATUS_CHANGED);
      expect(participantCalls.map((payload) => payload.userId)).toEqual(["buyer-1", "seller-1"]);
    });
  });

  describe("updateStatus, moving the case along", () => {
    it("makes a legal move and records it", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({ status: DD_ORDER_STATUS.IN_PROGRESS }),
      );

      await service.updateStatus(
        "order-1",
        { status: DD_ORDER_STATUS.COMPLETE, verdict: "Title is clean" },
        staff,
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DD_CASE_STATUS_CHANGED,
          before: { status: DD_ORDER_STATUS.IN_PROGRESS, verdict: null },
          after: { status: DD_ORDER_STATUS.COMPLETE, verdict: "Title is clean" },
        }),
      );
      expect(notifiedUserIds()).toEqual(["buyer-1", "seller-1"]);
      expect(notifications.create.mock.calls[0][0].body).toBe(
        "Case SBR-SRV-BUY-20260717-001 is complete with the verdict Title is clean.",
      );
    });

    it("refuses a move the state table does not allow", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({ status: DD_ORDER_STATUS.PAID }),
      );

      await expect(
        service.updateStatus("order-1", { status: DD_ORDER_STATUS.COMPLETE }, staff),
      ).rejects.toThrow("From PAID it can only move to IN_PROGRESS or CANCELLED");
      expect(prisma.dueDiligenceOrder.update).not.toHaveBeenCalled();
    });

    it("refuses to reopen a completed case", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({ status: DD_ORDER_STATUS.COMPLETE, verdict: "Title is clean" }),
      );

      await expect(
        service.updateStatus("order-1", { status: DD_ORDER_STATUS.IN_PROGRESS }, staff),
      ).rejects.toThrow("A complete due diligence case is final");
    });

    it("refuses a completion with no verdict", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({ status: DD_ORDER_STATUS.IN_PROGRESS }),
      );

      await expect(
        service.updateStatus("order-1", { status: DD_ORDER_STATUS.COMPLETE }, staff),
      ).rejects.toThrow("Verdict is required when completing a due diligence case");
    });

    it("rejects the move before it asks for a verdict", async () => {
      // A PENDING case cannot complete whatever verdict is offered, and telling the operator to go
      // and write one would send them off to draft something the case will not accept.
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({ status: DD_ORDER_STATUS.PENDING }),
      );

      await expect(
        service.updateStatus("order-1", { status: DD_ORDER_STATUS.COMPLETE }, staff),
      ).rejects.toThrow("Cannot move a due diligence case from PENDING to COMPLETE");
    });

    it("edits notes without a status change and tells nobody", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());

      await service.updateStatus("order-1", { staffNotes: "Chased the survey plan" }, staff);

      expect(prisma.dueDiligenceOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { staffNotes: "Chased the survey plan" },
      });
      expect(notifications.create).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledTimes(1);
    });

    it("treats a repeat of the current status as an edit, not a move", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());

      await service.updateStatus(
        "order-1",
        { status: DD_ORDER_STATUS.PAID, staffNotes: "Confirmed the receipt" },
        staff,
      );

      expect(notifications.create).not.toHaveBeenCalled();
    });

    // E1-S2 criterion 5, at the level where the notifications actually live. An operator who signs
    // the same case off twice is a double-clicked button, not an error, and the buyer must not be
    // told twice that their report is ready.
    it("does not tell anybody again when the same completion is replayed", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(
        caseFixture({ status: DD_ORDER_STATUS.COMPLETE, verdict: "Title is clean" }),
      );
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });
      prisma.transaction.findUnique.mockResolvedValue({ status: TransactionStatus.DD_COMPLETE });

      await service.updateStatus(
        "order-1",
        { status: DD_ORDER_STATUS.COMPLETE, verdict: "Title is clean" },
        staff,
      );

      expect(notifications.create).not.toHaveBeenCalled();
      // The case is not moved a second time either, so `completedAt` keeps the time of the first
      // sign-off rather than sliding forward on every retry.
      expect(prisma.dueDiligenceOrder.updateMany).not.toHaveBeenCalled();
    });

    // The same criterion under the race it exists for. Two operators sign off within a second of
    // each other: the first write moves the case, the second finds it already where it was sending
    // it. That second request is not a conflict and it is not a second notification.
    it("tells nobody when another operator got there first", async () => {
      prisma.dueDiligenceOrder.findUnique
        .mockResolvedValueOnce(caseFixture({ status: DD_ORDER_STATUS.IN_PROGRESS }))
        .mockResolvedValue(
          caseFixture({ status: DD_ORDER_STATUS.COMPLETE, verdict: "Title is clean" }),
        );
      // Nothing matched the conditional write, because the row had already left IN_PROGRESS.
      prisma.dueDiligenceOrder.updateMany.mockResolvedValue({ count: 0 });
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });
      prisma.transaction.findUnique.mockResolvedValue({ status: TransactionStatus.DD_COMPLETE });

      await service.updateStatus(
        "order-1",
        { status: DD_ORDER_STATUS.COMPLETE, verdict: "Title is clean" },
        staff,
      );

      expect(prisma.dueDiligenceOrder.updateMany).toHaveBeenCalledTimes(1);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it("does not let another buyer touch the case", async () => {
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());

      await expect(
        service.updateStatus("order-1", { status: DD_ORDER_STATUS.IN_PROGRESS }, otherBuyer),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("submitAssignmentReport", () => {
    it("takes the report, records it and tells the case and the office", async () => {
      prisma.dueDiligenceAssignment.findUnique.mockResolvedValue(
        assignmentFixture({
          dueDiligenceOrder: caseFixture({ assignments: [assignmentFixture()] }),
        }),
      );
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue(caseFixture());

      await service.submitAssignmentReport("assign-1", pdf, professional);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "pro-1",
          action: AuditAction.DD_CASE_REPORT_SUBMITTED,
          after: expect.objectContaining({ assignmentStatus: "SUBMITTED" }),
        }),
      );
      expect(notifiedUserIds()).toEqual(["buyer-1", "seller-1"]);
      expect(notifications.createForStaff).toHaveBeenCalledTimes(1);
    });

    it("gives a caller who is not the assignee the same 404 as a bad id", async () => {
      prisma.dueDiligenceAssignment.findUnique.mockResolvedValue(
        assignmentFixture({ dueDiligenceOrder: caseFixture() }),
      );

      await expect(
        service.submitAssignmentReport("assign-1", pdf, { ...professional, sub: "pro-9" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("gives an operator the same 404, because the report is the assignee's to file", async () => {
      prisma.dueDiligenceAssignment.findUnique.mockResolvedValue(
        assignmentFixture({ dueDiligenceOrder: caseFixture() }),
      );

      await expect(service.submitAssignmentReport("assign-1", pdf, staff)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("404s on an assignment that does not exist", async () => {
      prisma.dueDiligenceAssignment.findUnique.mockResolvedValue(null);

      await expect(service.submitAssignmentReport("nope", pdf, professional)).rejects.toThrow(
        "Assignment not found",
      );
    });

    it("does not accept a listing report against a standalone case", async () => {
      prisma.dueDiligenceAssignment.findUnique.mockResolvedValue(
        assignmentFixture({
          dueDiligenceOrder: caseFixture({ source: DD_SOURCE.STANDALONE }),
        }),
      );

      await expect(service.submitAssignmentReport("assign-1", pdf, professional)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("refuses a report against a case that is already signed off", async () => {
      prisma.dueDiligenceAssignment.findUnique.mockResolvedValue(
        assignmentFixture({
          dueDiligenceOrder: caseFixture({
            status: DD_ORDER_STATUS.COMPLETE,
            verdict: "Title is clean",
          }),
        }),
      );

      await expect(service.submitAssignmentReport("assign-1", pdf, professional)).rejects.toThrow(
        "Case SBR-SRV-BUY-20260717-001 is complete and is no longer taking reports",
      );
    });
  });
});
