import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma, TransactionStatus, UserRole } from "@prisma/client";
import { DdCoreService } from "./dd-core.service";
import { DdCaseSerializer, type DdOrderWithRelations } from "./dd-case.serializer";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { DdCmsService } from "../dd-cms/dd-cms.service";
import { TransactionStateService } from "../transactions/transaction-state.service";
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
      dueDiligenceOrder: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      dueDiligenceAssignment: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      transaction: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      serviceRequest: { findUnique: jest.fn() },
      serviceBundle: { findUnique: jest.fn() },
      serviceCatalogItem: { findMany: jest.fn().mockResolvedValue([]) },
      // The interactive form hands the callback a client to write through, and every write in this
      // service now goes through one. The double runs the callback against itself, so a test reads
      // the same mocks whether the call was wrapped in a transaction or not. The array form is kept
      // for the callers that still use it.
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === "function"
          ? (arg as (db: unknown) => Promise<unknown>)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn().mockResolvedValue("/uploads/report.pdf"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DdCoreService,
        DdCaseSerializer,
        TransactionStateService,
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
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: "txn-1", status: { in: [TransactionStatus.DD_PURCHASED] } },
        data: { status: TransactionStatus.DD_IN_PROGRESS },
      });
    });

    // E1-S2 criterion 4. All three writes are one unit of work, so an assignment cannot exist
    // against a case that still reads PAID, and a case cannot read IN_PROGRESS while its
    // transaction still says the buyer is waiting for somebody to pick the work up.
    it("puts the assignment, the case and the transaction in one database transaction", async () => {
      await service.createAssignment(orderFixture({ status: DD_ORDER_STATUS.PAID }), "pro-1", {
        professionalId: "pro-1",
        scheduleCode: "LEGAL_CHECK",
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(typeof prisma.$transaction.mock.calls[0][0]).toBe("function");
    });

    it("leaves a case already in progress where it is", async () => {
      const order = orderFixture({ status: DD_ORDER_STATUS.IN_PROGRESS });

      await service.createAssignment(order, "pro-1", {
        professionalId: "pro-1",
        scheduleCode: "LEGAL_CHECK",
      });

      expect(prisma.dueDiligenceOrder.update).not.toHaveBeenCalled();
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    });

    // A standalone case bought by a guest has no transaction to carry, and the assignment must
    // still be written. Reaching for a transaction id that is null would fail the whole write.
    it("assigns work on a case that has no transaction behind it", async () => {
      const order = orderFixture({ status: DD_ORDER_STATUS.PAID, transactionId: null });

      const assignment = await service.createAssignment(order, "pro-1", {
        professionalId: "pro-1",
        scheduleCode: "LEGAL_CHECK",
      });

      expect(assignment.id).toBe("assign-1");
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
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
      const result = await service.applyStatusChange(orderFixture({ verdict: "Title is clean" }), {
        staffNotes: "Chased the survey plan",
      });

      expect(prisma.dueDiligenceOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { staffNotes: "Chased the survey plan" },
      });
      expect(prisma.dueDiligenceOrder.updateMany).not.toHaveBeenCalled();
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({ statusChanged: false, transactionChanged: false });
    });

    it("stamps completedAt and closes the transaction on completion", async () => {
      const result = await service.applyStatusChange(
        orderFixture({ status: DD_ORDER_STATUS.IN_PROGRESS }),
        { status: DD_ORDER_STATUS.COMPLETE, verdict: "Title is clean" },
      );

      const data = prisma.dueDiligenceOrder.updateMany.mock.calls[0][0].data;
      expect(data.status).toBe(DD_ORDER_STATUS.COMPLETE);
      expect(data.completedAt).toBeInstanceOf(Date);
      expect(prisma.dueDiligenceOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { verdict: "Title is clean" },
      });
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: "txn-1",
          status: { in: [TransactionStatus.DD_PURCHASED, TransactionStatus.DD_IN_PROGRESS] },
        },
        data: { status: TransactionStatus.DD_COMPLETE },
      });
      expect(result).toEqual({ statusChanged: true, transactionChanged: true });
    });

    // E1-S2 criterion 4. The case write and the transaction move are one unit of work, so a
    // completed case whose transaction never moved cannot survive a failure between the two.
    it("puts the case write and the transaction move in one database transaction", async () => {
      await service.applyStatusChange(orderFixture({ status: DD_ORDER_STATUS.IN_PROGRESS }), {
        status: DD_ORDER_STATUS.COMPLETE,
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(typeof prisma.$transaction.mock.calls[0][0]).toBe("function");
    });

    // E1-S2 criterion 5. The second sign-off writes nothing and says so, which is what the caller
    // reads to decide that nobody needs telling twice.
    it("is idempotent when the same completion is replayed", async () => {
      const order = orderFixture({
        status: DD_ORDER_STATUS.COMPLETE,
        completedAt: new Date("2026-07-17T10:00:00.000Z"),
      });
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });
      prisma.transaction.findUnique.mockResolvedValue({ status: TransactionStatus.DD_COMPLETE });

      const result = await service.applyStatusChange(order, { status: DD_ORDER_STATUS.COMPLETE });

      expect(prisma.dueDiligenceOrder.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({ statusChanged: false, transactionChanged: false });
    });

    // E1-S2 criterion 3, on the case row rather than the transaction row. Two operators signing
    // off at once must not both believe they did it, and the loser gets a 409 rather than a 500.
    it("rejects a case that moved somewhere else while the change was being made", async () => {
      prisma.dueDiligenceOrder.updateMany.mockResolvedValue({ count: 0 });
      prisma.dueDiligenceOrder.findUnique.mockResolvedValue({
        status: DD_ORDER_STATUS.CANCELLED,
      });

      await expect(
        service.applyStatusChange(orderFixture({ status: DD_ORDER_STATUS.IN_PROGRESS }), {
          status: DD_ORDER_STATUS.COMPLETE,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    });

    // The bug this story fixes. The write this replaced was a ternary whose else branch was
    // unconditional, so cancelling a case marked its transaction as in progress.
    it("leaves the transaction alone when a case is cancelled", async () => {
      const result = await service.applyStatusChange(
        orderFixture({ status: DD_ORDER_STATUS.IN_PROGRESS }),
        { status: DD_ORDER_STATUS.CANCELLED },
      );

      expect(prisma.dueDiligenceOrder.updateMany).toHaveBeenCalledWith({
        where: { id: "order-1", status: DD_ORDER_STATUS.IN_PROGRESS },
        data: { status: DD_ORDER_STATUS.CANCELLED },
      });
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({ statusChanged: true, transactionChanged: false });
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

      // All three writes go into one $transaction call. A report that marked the assignment
      // submitted but failed to reach the case would leave the professional believing they had
      // delivered and an operator seeing nothing to review.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(typeof prisma.$transaction.mock.calls[0][0]).toBe("function");
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
      // E1-S2 criterion 1. The first report starts the work as surely as the first assignment
      // does, so it carries the transaction the same way.
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: "txn-1", status: { in: [TransactionStatus.DD_PURCHASED] } },
        data: { status: TransactionStatus.DD_IN_PROGRESS },
      });
    });

    it("leaves the transaction alone on a report against a case already in progress", async () => {
      await service.attachAssignmentReport(
        orderFixture({ status: DD_ORDER_STATUS.IN_PROGRESS }),
        { id: "assign-1" },
        {
          originalname: "survey.pdf",
          buffer: Buffer.from("pdf"),
          mimetype: "application/pdf",
        } as Express.Multer.File,
      );

      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    });

    it("refuses an upload with no file", async () => {
      await expect(
        service.attachAssignmentReport(orderFixture(), { id: "assign-1" }, undefined as never),
      ).rejects.toThrow("Report file is required");
    });
  });
});
