import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma, ProfessionalType, UserRole } from "@prisma/client";
import { DueDiligenceCaseService } from "./due-diligence-case.service";
import { DdCoreService } from "../dd-core/dd-core.service";
import { DdCaseSerializer, type DdOrderWithRelations } from "../dd-core/dd-case.serializer";
import { PrismaService } from "../prisma/prisma.service";
import { type JwtPayload } from "../auth/jwt.strategy";
import { StorageService } from "../storage/storage.service";
import { DdCmsService } from "../dd-cms/dd-cms.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService, type AuditLogInput } from "../audit/audit.service";
import { DocumentGrantService } from "../storage/document-grant.service";
import { TransactionStateService } from "../transactions/transaction-state.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { DD_ORDER_STATUS, DD_SOURCE } from "../dd-core/dd-case.constants";
import { EXCEPTION_FILTERS_METADATA } from "@nestjs/common/constants";
import { DueDiligenceController } from "./due-diligence.controller";
import { AnonymousNotFoundFilter } from "../common/filters/anonymous-not-found.filter";

/**
 * E1-S3: the buyer collects the document they paid for, and nobody else does.
 *
 * Kept out of `due-diligence-case.service.spec.ts` because the questions are different ones. That
 * file asks what the case lifecycle does; this one asks what a link is worth, how long it lasts and
 * who gets told. It needs almost none of that file's fixture, so sharing it would mean reading a
 * hundred lines of case state to follow a test about an expiry.
 */

const buyer: JwtPayload = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};
const otherBuyer: JwtPayload = { ...buyer, sub: "buyer-2" };
const staff: JwtPayload = {
  sub: "staff-1",
  email: "ops@safebuyrealties.test",
  role: UserRole.STAFF,
  professionalType: null,
};
const professional: JwtPayload = {
  sub: "pro-9",
  email: "ada@chambers.test",
  role: UserRole.PROFESSIONAL,
  professionalType: ProfessionalType.LAWYER,
};

const ORDER_REPORT = "due-diligence/order-1/reports/1753776000000-title-search.pdf";
const ASSIGNMENT_REPORT =
  "due-diligence/order-1/assignments/assign-1/1753776300000-legal-opinion.pdf";

/** Only the columns this file reads. The rest of the row says nothing about a download link. */
function caseFixture(overrides: Record<string, unknown> = {}): DdOrderWithRelations {
  return {
    id: "order-1",
    serviceId: "SBR-SRV-BUY-20260717-001",
    caseId: "SBR-CASE-DD-LOS-20260717-001",
    source: DD_SOURCE.LISTING,
    status: DD_ORDER_STATUS.COMPLETE,
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
    verdict: "CLEAR",
    staffNotes: null,
    completedAt: new Date("2026-07-29T12:00:00.000Z"),
    reportStorageKeys: [ORDER_REPORT],
    assignments: [],
    listing: null,
    externalProperty: null,
    transaction: null,
    createdAt: new Date("2026-07-17T09:00:00.000Z"),
    updatedAt: new Date("2026-07-29T12:00:00.000Z"),
    ...overrides,
  } as unknown as DdOrderWithRelations;
}

interface ReportLink {
  key: string;
  fileName: string;
  url: string;
  expiresAt: string;
}

interface ReportsResponse {
  orderId: string;
  status: string;
  expiresAt: string;
  reports: ReportLink[];
}

/** The `grant` query parameter off a link, which is the credential the reader will be handed. */
function grantOf(link: ReportLink): string {
  return new URL(link.url, "https://safebuyrealties.test").searchParams.get("grant") ?? "";
}

describe("listReports, collecting a due diligence report (E1-S3)", () => {
  let service: DueDiligenceCaseService;
  let grants: DocumentGrantService;
  let findUnique: jest.Mock;
  let auditRows: AuditLogInput[];

  beforeEach(async () => {
    auditRows = [];
    findUnique = jest.fn().mockResolvedValue(caseFixture());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DueDiligenceCaseService,
        DdCoreService,
        DdCaseSerializer,
        TransactionStateService,
        DocumentGrantService,
        { provide: PrismaService, useValue: { dueDiligenceOrder: { findUnique } } },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        {
          provide: DdCmsService,
          useValue: { getActiveDefinitions: jest.fn().mockResolvedValue([]) },
        },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        {
          provide: AuditService,
          useValue: {
            log: (input: AuditLogInput) => {
              auditRows.push(input);
              return Promise.resolve();
            },
          },
        },
      ],
    }).compile();

    service = module.get(DueDiligenceCaseService);
    grants = module.get(DocumentGrantService);
  });

  async function read(actor: JwtPayload = buyer, id = "order-1"): Promise<ReportsResponse> {
    return (await service.listReports(id, actor, "203.0.113.9")) as ReportsResponse;
  }

  describe("criterion 1: who is handed a link", () => {
    it("hands the buyer who paid a link for every report on the case", async () => {
      findUnique.mockResolvedValue(
        caseFixture({ reportStorageKeys: [ORDER_REPORT, ASSIGNMENT_REPORT] }),
      );

      const result = await read();

      expect(result.orderId).toBe("order-1");
      expect(result.reports.map((r) => r.key)).toEqual([ORDER_REPORT, ASSIGNMENT_REPORT]);
    });

    it("hands an operator the same links, because somebody has to support the case", async () => {
      const result = await read(staff);

      expect(result.reports).toHaveLength(1);
    });

    it("includes what a professional filed against a schedule, not only the case-level reports", async () => {
      // `attachAssignmentReport` appends to the same column, so a buyer who only ever saw
      // order-level keys would be missing documents they paid for and could not tell.
      findUnique.mockResolvedValue(caseFixture({ reportStorageKeys: [ASSIGNMENT_REPORT] }));

      const result = await read();

      expect(result.reports[0].key).toBe(ASSIGNMENT_REPORT);
    });

    it("names the file the way a person would, without the timestamp the key carries", async () => {
      const result = await read();

      expect(result.reports[0].fileName).toBe("title-search.pdf");
    });

    it("reads a standalone case too, which is the one thing getOne will not do", async () => {
      // The buyer due diligence screen lists standalone orders. Refusing them here would leave that
      // screen with links it cannot resolve for half its rows.
      findUnique.mockResolvedValue(caseFixture({ source: DD_SOURCE.STANDALONE, listingId: null }));

      const result = await read();

      expect(result.reports).toHaveLength(1);
    });
  });

  describe("criterion 2: what a link is worth", () => {
    it("expires in fifteen minutes, not more", async () => {
      const result = await read();
      const window = Date.parse(result.reports[0].expiresAt) - Date.now();

      expect(window).toBeGreaterThan(0);
      expect(window).toBeLessThanOrEqual(15 * 60 * 1000);
    });

    it("stamps every link in one response from the same instant", async () => {
      findUnique.mockResolvedValue(
        caseFixture({ reportStorageKeys: [ORDER_REPORT, ASSIGNMENT_REPORT] }),
      );

      const result = await read();

      expect(result.reports[1].expiresAt).toBe(result.reports[0].expiresAt);
      expect(result.expiresAt).toBe(result.reports[0].expiresAt);
    });

    it("signs a grant the reader will accept for that key and that buyer", async () => {
      const result = await read();

      expect(grants.verify(grantOf(result.reports[0]), ORDER_REPORT, "buyer-1")).toEqual({
        ok: true,
      });
    });

    it("is single-purpose: the grant on one report does not open the other", async () => {
      findUnique.mockResolvedValue(
        caseFixture({ reportStorageKeys: [ORDER_REPORT, ASSIGNMENT_REPORT] }),
      );

      const result = await read();

      expect(grants.verify(grantOf(result.reports[0]), ASSIGNMENT_REPORT, "buyer-1")).toEqual({
        ok: false,
        reason: "mismatched",
      });
    });

    it("is not a bearer token: a forwarded link does nothing for whoever received it", async () => {
      const result = await read();

      expect(grants.verify(grantOf(result.reports[0]), ORDER_REPORT, "buyer-2")).toEqual({
        ok: false,
        reason: "mismatched",
      });
    });

    it("stops working once the window has passed", async () => {
      const result = await read();
      const afterwards = new Date(Date.parse(result.reports[0].expiresAt) + 1);

      expect(
        grants.verify(grantOf(result.reports[0]), ORDER_REPORT, "buyer-1", afterwards),
      ).toEqual({ ok: false, reason: "expired" });
    });

    it("points at the guarded reader rather than a static path", async () => {
      const result = await read();

      expect(result.reports[0].url.startsWith("/api/v1/documents/file?key=")).toBe(true);
    });
  });

  describe("criterion 3: who is told nothing", () => {
    it("gives a different buyer a 404 rather than a 403", async () => {
      await expect(read(otherBuyer)).rejects.toThrow(NotFoundException);
    });

    it("gives a professional a 404 as well, assigned or not", async () => {
      // A professional reads the documents they are working on through the document reader, which
      // decides per key. Handing them the buyer's whole collection is a different question, and the
      // answer to it is no.
      await expect(read(professional)).rejects.toThrow(NotFoundException);
    });

    it("says the same words for a missing order as for somebody else's", async () => {
      findUnique.mockResolvedValue(null);

      await expect(read()).rejects.toThrow("Due diligence order not found");
      await expect(read(otherBuyer)).rejects.toThrow("Due diligence order not found");
    });

    it("issues nothing and records nothing when it refuses", async () => {
      await expect(read(otherBuyer)).rejects.toThrow(NotFoundException);

      expect(auditRows).toHaveLength(0);
    });
  });

  describe("criterion 4: the audit trail", () => {
    it("writes one row per link, naming the actor, the order and the key", async () => {
      await read();

      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toMatchObject({
        actorId: "buyer-1",
        action: AuditAction.DD_REPORT_LINK_ISSUED,
        entity: "DueDiligenceReport",
        entityId: ORDER_REPORT,
        ipAddress: "203.0.113.9",
      });
      expect(auditRows[0].after).toMatchObject({ orderId: "order-1", role: UserRole.BUYER });
    });

    it("writes a row per link rather than one per request", async () => {
      findUnique.mockResolvedValue(
        caseFixture({ reportStorageKeys: [ORDER_REPORT, ASSIGNMENT_REPORT] }),
      );

      await read();

      expect(auditRows.map((row) => row.entityId)).toEqual([ORDER_REPORT, ASSIGNMENT_REPORT]);
    });

    it("records the expiry it signed, so a later question about a leaked link has an answer", async () => {
      const result = await read();

      expect((auditRows[0].after as { expiresAt: string }).expiresAt).toBe(
        result.reports[0].expiresAt,
      );
    });

    it("names the operator when an operator asks, not the buyer who owns the case", async () => {
      await read(staff);

      expect(auditRows[0]).toMatchObject({ actorId: "staff-1" });
      expect(auditRows[0].after).toMatchObject({ role: UserRole.STAFF });
    });
  });

  describe("criterion 5: the case with nothing attached", () => {
    it("answers a complete case with no report at all rather than failing", async () => {
      findUnique.mockResolvedValue(caseFixture({ reportStorageKeys: [] }));

      const result = await read();

      expect(result.reports).toEqual([]);
      expect(result.status).toBe(DD_ORDER_STATUS.COMPLETE);
    });

    it("still says how long the answer is good for, so the screen is not guessing", async () => {
      findUnique.mockResolvedValue(caseFixture({ reportStorageKeys: [] }));

      const result = await read();

      expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
    });

    it("writes no audit row when there was no link to issue", async () => {
      findUnique.mockResolvedValue(caseFixture({ reportStorageKeys: [] }));

      await read();

      expect(auditRows).toHaveLength(0);
    });

    it("reports the status of a case still being worked, so the screen can say wait", async () => {
      findUnique.mockResolvedValue(
        caseFixture({ status: DD_ORDER_STATUS.IN_PROGRESS, reportStorageKeys: [], verdict: null }),
      );

      const result = await read();

      expect(result.status).toBe(DD_ORDER_STATUS.IN_PROGRESS);
      expect(result.reports).toEqual([]);
    });
  });
});

/**
 * The service above answers 404 to the wrong buyer. The other half of criterion 3, the caller with
 * no session at all, is decided before the service is reached: `JwtAuthGuard` throws 401 and
 * `AnonymousNotFoundFilter` converts it. What that filter does with the exception is
 * `anonymous-not-found.filter.spec.ts`; what is left to prove is that this route is the one wearing
 * it, and that no other route is.
 */
describe("the anonymous answer is wired to this route and no other", () => {
  const filtersOn = (handler: string): unknown[] =>
    (Reflect.getMetadata(
      EXCEPTION_FILTERS_METADATA,
      DueDiligenceController.prototype[handler as keyof DueDiligenceController],
    ) as unknown[]) ?? [];

  it("mounts the filter on the reports route", () => {
    expect(filtersOn("listReports")).toContain(AnonymousNotFoundFilter);
  });

  it.each(["list", "getOne", "create", "assign", "updateStatus"])(
    "leaves %s able to say sign in",
    (handler) => {
      // Flattening 401 to 404 across the controller would cost the whole product the one message a
      // session that ran out needs to show. The narrow mounting is the design, so it is pinned.
      expect(filtersOn(handler)).not.toContain(AnonymousNotFoundFilter);
    },
  );
});
