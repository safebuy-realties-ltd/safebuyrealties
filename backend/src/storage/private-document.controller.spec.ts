import { CanActivate, ExecutionContext, Injectable, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { ListingStatus, UserRole } from "@prisma/client";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { configureApp } from "../app-bootstrap";
import { AuditService, AuditLogInput } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt.guard";
import {
  PUBLIC_LISTING_ASSET_CATEGORIES,
  isPublicListingAssetCategory,
} from "../documents/document-categories";
import { JwtPayload } from "../auth/jwt.strategy";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentGrantService } from "./document-grant.service";
import { PrivateDocumentAuthorizer } from "./private-document-authorizer";
import { PrivateDocumentController } from "./private-document.controller";
import { StorageService } from "./storage.service";
import {
  describePrivateDocument,
  isPrivateDocumentKey,
  privateDocumentUrl,
  resolvePrivateDocumentTarget,
} from "./private-documents";

/**
 * E3-S1c, E3-S1d-1, E3-S1d-2 and E3-S1d-3: what the authorized reader actually decides.
 *
 * `uploads-exposure.spec.ts` proves the private document URL is a Nest route rather than a static
 * path, which is the structural half. This is the other half — with a real session, who gets the
 * bytes. The app is built with the real configureApp(), so the global prefix, exception filter and
 * response interceptor are production's; only the session is substituted.
 *
 * E3-S1d-3 gave this suite a second job. The `/uploads` mount and the E3-S1b gate in front of it
 * are gone, and every assertion `public-listing-asset.gate.spec.ts` used to make about which
 * listing categories reach an anonymous visitor now has to be made here, against the route that
 * inherited the rule — see "who gets listing document bytes". Two suites deciding one prefix is
 * how the next leak gets in, which is exactly why there is now one route to test.
 */

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const PROFESSIONAL = "33333333-3333-3333-3333-333333333333";
const DD_BUYER = "44444444-4444-4444-4444-444444444444";
const ASSIGNED_PROFESSIONAL = "55555555-5555-5555-5555-555555555555";
const DD_ORDER = "66666666-6666-6666-6666-666666666666";
const ASSIGNMENT = "77777777-7777-7777-7777-777777777777";
/** Never in the stub, so it stands in for both a deleted order and a guessed id. */
const UNKNOWN_ORDER = "88888888-8888-8888-8888-888888888888";
const POA_TX = "99999999-9999-9999-9999-999999999999";
const POA_BUYER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const POA_SELLER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const UNKNOWN_TX = "cccccccc-cccc-cccc-cccc-cccccccccccc";
/** A standalone transaction: `listingId` is null (schema.prisma:242), so it has no seller side. */
const STANDALONE_TX = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const KYC_KEY = `kyc/${OWNER}/1700000000000_government-id.pdf`;
const KYC_BYTES = "government ID scan";
const LICENSE_KEY = `professionals/${PROFESSIONAL}/license/1700000000000_licence.jpg`;
const LICENSE_BYTES = "surveyor licence";
/** Both due diligence key shapes, exactly as standalone-dd.service.ts:1107 and :1275 build them. */
const DD_REPORT_KEY = `due-diligence/${DD_ORDER}/reports/1700000000000-report.pdf`;
const DD_REPORT_BYTES = "due diligence report";
const DD_ASSIGNMENT_KEY = `due-diligence/${DD_ORDER}/assignments/${ASSIGNMENT}/1700000000000-survey.pdf`;
const DD_ASSIGNMENT_BYTES = "surveyor findings";
/** Both power of attorney key shapes, exactly as poa.service.ts:217 and :222 build them. */
const POA_PDF_KEY = `poa/${POA_TX}/1700000000000_abc123def456.pdf`;
const POA_PDF_BYTES = "executed power of attorney";
const POA_QR_KEY = `poa/${POA_TX}/abc123def456_qr.png`;
const POA_QR_BYTES = "verification QR pixels";
/** No upload path validates a MIME type yet (that is E3-S3), so this is reachable today. */
const SMUGGLED_KEY = `kyc/${OWNER}/1700000000001_selfie.html`;
const SMUGGLED_BYTES = "<script>fetch('/api/v1/users/me')</script>";

/** One publicly visible listing and one still in draft, both belonging to LISTING_SELLER. */
const LISTING = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const DRAFT_LISTING = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const LISTING_SELLER = "10101010-1010-1010-1010-101010101010";
/** Uploaded the survey plan and nothing else, and is assigned to no work on the listing. */
const LISTING_UPLOADER = "20202020-2020-2020-2020-202020202020";
/** Has a transaction on LISTING. */
const LISTING_BUYER = "30303030-3030-3030-3030-303030303030";
/** Assigned through a VerificationStep. */
const STEP_PROFESSIONAL = "40404040-4040-4040-4040-404040404040";
/** Assigned through a Task, which is the other half of the same OR in the authorizer. */
const TASK_PROFESSIONAL = "50505050-5050-5050-5050-505050505050";
/** Never in the stub, so it stands in for a guessed key. */
const UNKNOWN_LISTING = "60606060-6060-6060-6060-606060606060";

/**
 * Every category the seller upload form offers — the `DocType` union at
 * `dashboard.seller.documents.tsx:53` — each with a document on the publicly visible listing.
 * Criterion 5's walk runs over this list, and a test below checks the `public` column against
 * `PUBLIC_LISTING_ASSET_CATEGORIES` so the walk cannot quietly assert the wrong outcome.
 *
 * `public` here means the *bytes* are public, which is only listing imagery — narrower than
 * `documents.service.ts`'s PUBLIC_DOCUMENT_CATEGORIES, where a survey plan's existence is
 * advertised on the listing page and its contents are not.
 */
const LISTING_CATEGORIES: readonly { category: string; file: string; public: boolean }[] = [
  { category: "title_deed", file: "certificate-of-occupancy.pdf", public: false },
  { category: "survey_plan", file: "survey.pdf", public: false },
  { category: "building_approval", file: "permit.pdf", public: false },
  { category: "tax_receipt", file: "tax-receipt.pdf", public: false },
  { category: "other", file: "misc.pdf", public: false },
  { category: "listing_hero", file: "hero.jpg", public: true },
  { category: "listing_gallery", file: "garden.jpg", public: true },
];

/** Exactly the shape documents.service.ts:109 builds: listings/<listingId>/<ms>_<safeName>. */
const listingKey = (listingId: string, file: string) =>
  `listings/${listingId}/1700000000000_${file}`;

const HERO_KEY = listingKey(LISTING, "hero.jpg");
const GALLERY_KEY = listingKey(LISTING, "garden.jpg");
const TITLE_DEED_KEY = listingKey(LISTING, "certificate-of-occupancy.pdf");
const SURVEY_PLAN_KEY = listingKey(LISTING, "survey.pdf");
const DRAFT_HERO_KEY = listingKey(DRAFT_LISTING, "hero.jpg");

const PUBLIC_BYTES = "public listing photograph";
const LISTING_SECRET = "PRIVATE LISTING DOCUMENT CONTENTS";

function session(sub: string, role: UserRole): JwtPayload {
  return { sub, email: `${sub}@example.test`, role, professionalType: null };
}

/** Set per test; null means "no session at all". */
let currentUser: JwtPayload | null = null;

/**
 * Stands in for OptionalJwtAuthGuard: attaches a session when there is one, and permits the request
 * when there is not.
 *
 * Permitting anonymous is the change E3-S1d-3 made and it is deliberate. A guard that refused it
 * would test the guard rather than the policy, and would make the public listing asset path — the
 * one thing on this endpoint a visitor is allowed to read — impossible to assert here at all. What
 * the real guard does with a session that is *present and broken* is `optional-jwt.guard.spec.ts`;
 * what it does with the absence of one is the whole of the block below.
 */
@Injectable()
class StubSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (currentUser) {
      context.switchToHttp().getRequest<{ user?: JwtPayload }>().user = currentUser;
    }
    return true;
  }
}

const auditRows: AuditLogInput[] = [];

/**
 * One order, bought by DD_BUYER, worked by ASSIGNED_PROFESSIONAL. Stubbed rather than connected
 * because this suite must not need the shared cloud Postgres; the shape is exactly the `select`
 * the authorizer issues.
 */
const dueDiligenceOrders: Readonly<
  Record<string, { buyerId: string; assignments: { professionalId: string }[] }>
> = {
  [DD_ORDER]: { buyerId: DD_BUYER, assignments: [{ professionalId: ASSIGNED_PROFESSIONAL }] },
};

/**
 * One listing-backed transaction between POA_BUYER and POA_SELLER, and one standalone transaction
 * with no listing at all. Shape matches the `select` the authorizer issues, nested relation included.
 */
const transactions: Readonly<
  Record<string, { buyerId: string; listing: { sellerId: string } | null }>
> = {
  [POA_TX]: { buyerId: POA_BUYER, listing: { sellerId: POA_SELLER } },
  [STANDALONE_TX]: { buyerId: POA_BUYER, listing: null },
};

/**
 * Every listing document that exists, on two listings that differ only in visibility. Note all of
 * them share one storage prefix: that is the fact E3-S1d-3 had to work around, because it means a
 * title deed and a hero image are indistinguishable as keys and only the row can tell them apart.
 */
const LIVE = { sellerId: LISTING_SELLER, status: ListingStatus.LIVE, isPublished: true };
const DRAFT = { sellerId: LISTING_SELLER, status: ListingStatus.DRAFT, isPublished: false };

const listingDocuments: readonly {
  storageKey: string;
  category: string;
  listingId: string;
  uploadedById: string;
  listing: { sellerId: string; status: ListingStatus; isPublished: boolean };
}[] = [
  ...LISTING_CATEGORIES.map((entry) => ({
    storageKey: listingKey(LISTING, entry.file),
    category: entry.category,
    listingId: LISTING,
    // The survey plan came from someone other than the seller, so `uploadedById` is a branch of
    // its own rather than a second way of spelling the owner.
    uploadedById: entry.category === "survey_plan" ? LISTING_UPLOADER : LISTING_SELLER,
    listing: LIVE,
  })),
  {
    storageKey: DRAFT_HERO_KEY,
    category: "listing_hero",
    listingId: DRAFT_LISTING,
    uploadedById: LISTING_SELLER,
    listing: DRAFT,
  },
];

const prismaStub = {
  /**
   * Applies the authorizer's own `where` to the fixture rows rather than pattern-matching the
   * call, which is what stops this from flattering the authorizer: the lookup is by `storageKey`,
   * so a change to look up by the listing id in the key instead would start returning the wrong
   * row and these tests would notice.
   */
  document: {
    findFirst: ({ where }: { where: { storageKey: string } }) =>
      Promise.resolve(listingDocuments.find((doc) => doc.storageKey === where.storageKey) ?? null),
  },
  dueDiligenceOrder: {
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(dueDiligenceOrders[where.id] ?? null),
  },
  /**
   * `count` is the listing-document engagement lookup, `findUnique` the power of attorney one.
   * Nobody is engaged with the draft listing, so being a party to one listing cannot open another.
   */
  transaction: {
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(transactions[where.id] ?? null),
    count: ({ where }: { where: { listingId: string; buyerId: string } }) =>
      Promise.resolve(where.listingId === LISTING && where.buyerId === LISTING_BUYER ? 1 : 0),
  },
  /**
   * A professional is admitted by a VerificationStep *or* a Task, counted separately and summed.
   * Each half has its own fixture professional: with only one stubbed, dropping the other from the
   * sum would still pass.
   */
  verificationStep: {
    count: ({ where }: { where: { listingId: string; assignedProfessionalId: string } }) =>
      Promise.resolve(
        where.listingId === LISTING && where.assignedProfessionalId === STEP_PROFESSIONAL ? 1 : 0,
      ),
  },
  task: {
    count: ({ where }: { where: { listingId: string; assigneeId: string } }) =>
      Promise.resolve(
        where.listingId === LISTING && where.assigneeId === TASK_PROFESSIONAL ? 1 : 0,
      ),
  },
};

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
  controllers: [PrivateDocumentController],
  providers: [
    StorageService,
    PrivateDocumentAuthorizer,
    // The real grant service, so the cases below exercise the same signature check a browser
    // would. Every URL here is grant-free, which is the point: a grant narrows a session, it never
    // stands in for one, so removing the parameter has to leave every one of these answers alone.
    DocumentGrantService,
    {
      provide: AuditService,
      useValue: {
        log: (input: AuditLogInput) => {
          auditRows.push(input);
          return Promise.resolve();
        },
      },
    },
    { provide: PrismaService, useValue: prismaStub },
  ],
})
class PrivateDocumentTestModule {}

describe("authorized private document access (E3-S1c, E3-S1d-1, E3-S1d-2)", () => {
  let app: NestExpressApplication;
  let uploadRoot: string;
  const originalEnv = {
    storageLocalPath: process.env.STORAGE_LOCAL_PATH,
    uploadDir: process.env.UPLOAD_DIR,
    storageDriver: process.env.STORAGE_DRIVER,
  };

  const url = (key: string) => privateDocumentUrl(key);
  /**
   * Documents come back as binary, so supertest parks them in `body` as a Buffer and leaves `text`
   * undefined. Asking for the bytes explicitly is also the sharper assertion: it is the delivered
   * payload, not a string superagent happened to decode.
   */
  const download = (key: string) => request(app.getHttpServer()).get(url(key)).responseType("blob");
  const bytesOf = (response: request.Response): string =>
    Buffer.isBuffer(response.body) ? response.body.toString("utf8") : (response.text ?? "");

  beforeAll(async () => {
    uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sbr-private-docs-"));
    const write = (key: string, bytes: string) => {
      const abs = path.join(uploadRoot, key);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, bytes);
    };
    write(KYC_KEY, KYC_BYTES);
    write(LICENSE_KEY, LICENSE_BYTES);
    write(DD_REPORT_KEY, DD_REPORT_BYTES);
    write(DD_ASSIGNMENT_KEY, DD_ASSIGNMENT_BYTES);
    write(POA_PDF_KEY, POA_PDF_BYTES);
    write(POA_QR_KEY, POA_QR_BYTES);
    write(SMUGGLED_KEY, SMUGGLED_BYTES);
    // Every listing document exists on disk, public and private alike. Only the authorizer decides
    // which of them come back — a test that passed because the bytes were missing would prove
    // nothing about the policy.
    for (const entry of LISTING_CATEGORIES) {
      write(listingKey(LISTING, entry.file), entry.public ? PUBLIC_BYTES : LISTING_SECRET);
    }
    write(DRAFT_HERO_KEY, PUBLIC_BYTES);
    fs.writeFileSync(path.join(os.tmpdir(), "sbr-private-docs-outside.txt"), "outside the root");

    process.env.STORAGE_LOCAL_PATH = uploadRoot;
    process.env.STORAGE_DRIVER = "local";
    delete process.env.UPLOAD_DIR;

    const moduleRef = await Test.createTestingModule({
      imports: [PrivateDocumentTestModule],
    })
      .overrideGuard(OptionalJwtAuthGuard)
      .useClass(StubSessionGuard)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("STORAGE_LOCAL_PATH", originalEnv.storageLocalPath);
    restore("UPLOAD_DIR", originalEnv.uploadDir);
    restore("STORAGE_DRIVER", originalEnv.storageDriver);
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    fs.rmSync(path.join(os.tmpdir(), "sbr-private-docs-outside.txt"), { force: true });
  });

  beforeEach(() => {
    currentUser = null;
    auditRows.length = 0;
  });

  describe("who gets the bytes", () => {
    it("serves a KYC document to the user it belongs to", async () => {
      currentUser = session(OWNER, UserRole.BUYER);

      const response = await download(KYC_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(KYC_BYTES);
    });

    it("refuses another buyer asking for the same KYC document", async () => {
      currentUser = session(OTHER, UserRole.BUYER);

      const response = await request(app.getHttpServer()).get(url(KYC_KEY));

      expect(response.status).toBe(403);
      expect(response.text).not.toContain(KYC_BYTES);
    });

    it("refuses a professional asking for someone else's KYC document", async () => {
      currentUser = session(PROFESSIONAL, UserRole.PROFESSIONAL);

      const response = await request(app.getHttpServer()).get(url(KYC_KEY));

      expect(response.status).toBe(403);
    });

    it("refuses a seller asking for someone else's KYC document", async () => {
      currentUser = session(OTHER, UserRole.SELLER);

      const response = await request(app.getHttpServer()).get(url(KYC_KEY));

      expect(response.status).toBe(403);
    });

    it.each([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN])(
      "serves a KYC document to %s, who has to review it",
      async (role) => {
        currentUser = session(OTHER, role);

        const response = await download(KYC_KEY);

        expect(response.status).toBe(200);
        expect(bytesOf(response)).toBe(KYC_BYTES);
      },
    );

    it("serves a credential document to the professional it belongs to", async () => {
      currentUser = session(PROFESSIONAL, UserRole.PROFESSIONAL);

      const response = await download(LICENSE_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(LICENSE_BYTES);
    });

    it("refuses a different professional asking for that credential", async () => {
      currentUser = session(OTHER, UserRole.PROFESSIONAL);

      const response = await request(app.getHttpServer()).get(url(LICENSE_KEY));

      expect(response.status).toBe(403);
    });

    it("serves a credential document to STAFF, who has to review it", async () => {
      currentUser = session(OTHER, UserRole.STAFF);

      const response = await download(LICENSE_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(LICENSE_BYTES);
    });

    it("refuses a request with no session", async () => {
      const response = await request(app.getHttpServer()).get(url(KYC_KEY));

      expect(response.status).toBe(401);
      expect(response.text).not.toContain(KYC_BYTES);
    });
  });

  /**
   * The families above are decided from the key. These are decided from the database, because the
   * id in the key names an order and not a person. Every refusal below is a 403, including the one
   * for an order that does not exist.
   */
  describe("who gets due diligence bytes (E3-S1d-1)", () => {
    it("serves a report to the buyer who ordered it", async () => {
      currentUser = session(DD_BUYER, UserRole.BUYER);

      const response = await download(DD_REPORT_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(DD_REPORT_BYTES);
    });

    it("serves a report to a professional assigned to that order", async () => {
      currentUser = session(ASSIGNED_PROFESSIONAL, UserRole.PROFESSIONAL);

      const response = await download(DD_REPORT_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(DD_REPORT_BYTES);
    });

    it("serves an assignment attachment to the assigned professional too", async () => {
      currentUser = session(ASSIGNED_PROFESSIONAL, UserRole.PROFESSIONAL);

      const response = await download(DD_ASSIGNMENT_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(DD_ASSIGNMENT_BYTES);
    });

    it("refuses a professional who is not assigned to that order", async () => {
      currentUser = session(PROFESSIONAL, UserRole.PROFESSIONAL);

      const response = await request(app.getHttpServer()).get(url(DD_REPORT_KEY));

      expect(response.status).toBe(403);
      expect(response.text).not.toContain(DD_REPORT_BYTES);
    });

    it("refuses a buyer who did not order it", async () => {
      currentUser = session(OTHER, UserRole.BUYER);

      const response = await request(app.getHttpServer()).get(url(DD_REPORT_KEY));

      expect(response.status).toBe(403);
    });

    it("serves a report to STAFF, who has to support the order", async () => {
      currentUser = session(OTHER, UserRole.STAFF);

      const response = await download(DD_REPORT_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(DD_REPORT_BYTES);
    });

    /**
     * The endpoint must not tell a logged-in caller which order ids are real. A well-formed key
     * naming an order that does not exist has to be indistinguishable from one naming an order
     * that does and is not theirs — hence 403 on both, decided before storage is touched.
     */
    it("403s rather than 404s on an order that does not exist, so ids cannot be walked", async () => {
      currentUser = session(OTHER, UserRole.BUYER);

      const real = await request(app.getHttpServer()).get(url(DD_REPORT_KEY));
      const invented = await request(app.getHttpServer()).get(
        url(`due-diligence/${UNKNOWN_ORDER}/reports/1700000000000-report.pdf`),
      );

      expect(real.status).toBe(403);
      expect(invented.status).toBe(403);
    });

    it("lets an operator through to a plain 404 when the order does not exist", async () => {
      currentUser = session(OTHER, UserRole.ADMIN);

      const response = await request(app.getHttpServer()).get(
        url(`due-diligence/${UNKNOWN_ORDER}/reports/1700000000000-report.pdf`),
      );

      expect(response.status).toBe(404);
    });
  });

  /**
   * A power of attorney is an instrument of the transaction rather than of one party, so its reader
   * set is both sides plus operators. Until E3-S1d-2 these keys resolved under `/uploads`, which
   * meant an executed deed and the QR code that verifies it were readable with no session at all.
   */
  describe("who gets power of attorney bytes (E3-S1d-2)", () => {
    it("serves the deed to the buyer who executed it", async () => {
      currentUser = session(POA_BUYER, UserRole.BUYER);

      const response = await download(POA_PDF_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(POA_PDF_BYTES);
    });

    /**
     * The QR image is a second object under the same prefix, and it is not incidental: it encodes
     * the verification link for that deed. One policy has to cover both key shapes or the picture
     * stays public while the document it verifies is locked.
     */
    it("serves the QR code under the same rule as the deed", async () => {
      currentUser = session(POA_BUYER, UserRole.BUYER);

      const allowed = await download(POA_QR_KEY);
      currentUser = session(OTHER, UserRole.BUYER);
      const refused = await request(app.getHttpServer()).get(url(POA_QR_KEY));

      expect(allowed.status).toBe(200);
      expect(bytesOf(allowed)).toBe(POA_QR_BYTES);
      expect(refused.status).toBe(403);
      expect(refused.text).not.toContain(POA_QR_BYTES);
    });

    it("serves the deed to the seller on the other side of the transaction", async () => {
      currentUser = session(POA_SELLER, UserRole.SELLER);

      const response = await download(POA_PDF_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(POA_PDF_BYTES);
    });

    it("refuses a buyer who is not party to the transaction", async () => {
      currentUser = session(OTHER, UserRole.BUYER);

      const response = await request(app.getHttpServer()).get(url(POA_PDF_KEY));

      expect(response.status).toBe(403);
      expect(response.text).not.toContain(POA_PDF_BYTES);
    });

    it("refuses a seller who is not the seller of this listing", async () => {
      currentUser = session(OTHER, UserRole.SELLER);

      const response = await request(app.getHttpServer()).get(url(POA_PDF_KEY));

      expect(response.status).toBe(403);
    });

    it("refuses a professional, who is not party to a sale", async () => {
      currentUser = session(PROFESSIONAL, UserRole.PROFESSIONAL);

      const response = await request(app.getHttpServer()).get(url(POA_PDF_KEY));

      expect(response.status).toBe(403);
    });

    it.each([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN])(
      "serves the deed to %s, who has to support the transaction",
      async (role) => {
        currentUser = session(OTHER, role);

        const response = await download(POA_PDF_KEY);

        expect(response.status).toBe(200);
        expect(bytesOf(response)).toBe(POA_PDF_BYTES);
      },
    );

    /**
     * `Transaction.listingId` is nullable (schema.prisma:242). A transaction with no listing has no
     * seller to admit, so the counterparty branch must not fall through to admitting everyone.
     */
    it("admits no counterparty on a standalone transaction that has no listing", async () => {
      currentUser = session(POA_SELLER, UserRole.SELLER);

      const response = await request(app.getHttpServer()).get(
        url(`poa/${STANDALONE_TX}/1700000000000_abc123def456.pdf`),
      );

      expect(response.status).toBe(403);
    });

    it("403s rather than 404s on a transaction that does not exist", async () => {
      currentUser = session(OTHER, UserRole.BUYER);

      const real = await request(app.getHttpServer()).get(url(POA_PDF_KEY));
      const invented = await request(app.getHttpServer()).get(
        url(`poa/${UNKNOWN_TX}/1700000000000_abc123def456.pdf`),
      );

      expect(real.status).toBe(403);
      expect(invented.status).toBe(403);
    });

    it("lets an operator through to a plain 404 when the transaction does not exist", async () => {
      currentUser = session(OTHER, UserRole.ADMIN);

      const response = await request(app.getHttpServer()).get(
        url(`poa/${UNKNOWN_TX}/1700000000000_abc123def456.pdf`),
      );

      expect(response.status).toBe(404);
    });
  });

  /**
   * E3-S1d-3, and the reason it was a story rather than a line. Every other family is private in
   * full; this one carries the seller's title deeds and the marketplace's gallery photographs under
   * a single storage prefix, so the same route has to serve an anonymous visitor and refuse them,
   * one `Document` row apart.
   *
   * The rule itself is not new — it is the E3-S1b gate, moved off the static mount and onto the
   * route. What is new is that it is the *only* copy of it, which is why the whole of the deleted
   * `public-listing-asset.gate.spec.ts` is reproduced here rather than dropped.
   */
  describe("who gets listing document bytes (E3-S1d-3)", () => {
    it.each([
      ["a hero image", HERO_KEY],
      ["a gallery photograph", GALLERY_KEY],
    ])("serves %s on a publicly visible listing to a visitor with no session", async (_l, key) => {
      const response = await download(key);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(PUBLIC_BYTES);
    });

    /**
     * The whole point of the story. Same listing, same storage prefix, one directory entry away
     * from the hero image served by the test above — and it must not come back to anyone.
     */
    it.each([
      ["a title deed", TITLE_DEED_KEY],
      ["a survey plan", SURVEY_PLAN_KEY],
    ])("refuses %s stored under the same listings/ prefix", async (_label, key) => {
      const response = await request(app.getHttpServer()).get(url(key));

      expect(response.status).toBe(401);
      expect(response.text).not.toContain(LISTING_SECRET);
    });

    /**
     * Criterion 5's walk. Every category the seller upload form offers, one request each with no
     * session: exactly the two imagery categories come back and every other one is refused. A
     * category added to `dashboard.seller.documents.tsx` without a decision about its bytes fails
     * here, which is the only reason this is a walk over the list rather than five hand-written
     * cases.
     */
    it.each(
      LISTING_CATEGORIES.map(
        (entry) =>
          [entry.category, entry.public ? "served" : "refused", entry.file, entry.public] as const,
      ),
    )("%s is %s to a visitor with no session", async (_category, _outcome, file, isPublic) => {
      const response = await download(listingKey(LISTING, file));

      expect(response.status).toBe(isPublic ? 200 : 401);
      expect(bytesOf(response)).not.toContain(LISTING_SECRET);
    });

    /**
     * The walk above is only worth its name if its own `public` column is right, and that column is
     * hand-written — nothing derives it. So it is checked against the list the authorizer actually
     * consults: widen `PUBLIC_LISTING_ASSET_CATEGORIES` and the walk widens with it or this fails.
     *
     * What no test can check is the other end. `Document.category` is a bare `String` in the schema
     * (`schema.prisma:192`), so a category exists the moment someone types one — the list here is
     * the seller upload form's `DocType` union, copied. A category added there and not here is
     * refused by default, which is the safe direction, and it is the reason this list is documented
     * with its source rather than left to look self-evident.
     */
    it("agrees with the category list the authorizer reads", () => {
      const walked = LISTING_CATEGORIES.filter((entry) => entry.public).map((e) => e.category);

      expect(walked.sort()).toEqual([...PUBLIC_LISTING_ASSET_CATEGORIES].sort());
      for (const entry of LISTING_CATEGORIES) {
        expect(isPublicListingAssetCategory(entry.category)).toBe(entry.public);
      }
    });

    it("refuses a hero image whose listing is not publicly visible yet", async () => {
      const response = await request(app.getHttpServer()).get(url(DRAFT_HERO_KEY));

      expect(response.status).toBe(401);
    });

    it("serves that draft hero image to the seller it belongs to", async () => {
      currentUser = session(LISTING_SELLER, UserRole.SELLER);

      const response = await download(DRAFT_HERO_KEY);

      expect(response.status).toBe(200);
    });

    it("serves a title deed to the seller who owns the listing", async () => {
      currentUser = session(LISTING_SELLER, UserRole.SELLER);

      const response = await download(TITLE_DEED_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(LISTING_SECRET);
    });

    /**
     * `uploadedById` is a reader in its own right, not a second spelling of the seller: a
     * professional who filed a survey plan can still open the document they filed.
     */
    it("serves a document to whoever uploaded it, even though they are not the seller", async () => {
      currentUser = session(LISTING_UPLOADER, UserRole.PROFESSIONAL);

      const uploaded = await download(SURVEY_PLAN_KEY);
      const notTheirs = await request(app.getHttpServer()).get(url(TITLE_DEED_KEY));

      expect(uploaded.status).toBe(200);
      expect(notTheirs.status).toBe(403);
      expect(notTheirs.text).not.toContain(LISTING_SECRET);
    });

    it("serves a title deed to a buyer with a transaction on the listing", async () => {
      currentUser = session(LISTING_BUYER, UserRole.BUYER);

      const response = await download(TITLE_DEED_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(LISTING_SECRET);
    });

    it("refuses a buyer with no transaction on it, who can still see the photographs", async () => {
      currentUser = session(OTHER, UserRole.BUYER);

      const refused = await request(app.getHttpServer()).get(url(TITLE_DEED_KEY));
      const hero = await download(HERO_KEY);

      expect(refused.status).toBe(403);
      expect(refused.text).not.toContain(LISTING_SECRET);
      expect(hero.status).toBe(200);
    });

    /**
     * Assignment reaches this listing through two different tables and the authorizer sums them.
     * Both are exercised because a professional assigned only by Task is admitted by the second
     * half of that sum, and nothing else would catch its loss.
     */
    it.each([
      ["a verification step", STEP_PROFESSIONAL],
      ["a task", TASK_PROFESSIONAL],
    ])("serves a title deed to a professional assigned through %s", async (_label, sub) => {
      currentUser = session(sub, UserRole.PROFESSIONAL);

      const response = await download(TITLE_DEED_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(LISTING_SECRET);
    });

    it("refuses a professional assigned to nothing on this listing", async () => {
      currentUser = session(PROFESSIONAL, UserRole.PROFESSIONAL);

      const response = await request(app.getHttpServer()).get(url(TITLE_DEED_KEY));

      expect(response.status).toBe(403);
      expect(response.text).not.toContain(LISTING_SECRET);
    });

    it.each([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN])(
      "serves a title deed to %s, who has to verify it",
      async (role) => {
        currentUser = session(OTHER, role);

        const response = await download(TITLE_DEED_KEY);

        expect(response.status).toBe(200);
        expect(bytesOf(response)).toBe(LISTING_SECRET);
      },
    );

    /**
     * A key with no `Document` row is a key the application never wrote. It has to be refused the
     * same way a private one is, or the endpoint tells an anonymous caller which keys are real.
     */
    it("refuses a well-formed listings/ key with no Document row behind it", async () => {
      const anonymous = await request(app.getHttpServer()).get(
        url(listingKey(UNKNOWN_LISTING, "hero.jpg")),
      );
      currentUser = session(OTHER, UserRole.BUYER);
      const loggedIn = await request(app.getHttpServer()).get(
        url(listingKey(UNKNOWN_LISTING, "hero.jpg")),
      );

      expect(anonymous.status).toBe(401);
      expect(loggedIn.status).toBe(403);
    });

    it("lets an operator through to a plain 404 when there is no Document row", async () => {
      currentUser = session(OTHER, UserRole.ADMIN);

      const response = await request(app.getHttpServer()).get(
        url(listingKey(UNKNOWN_LISTING, "hero.jpg")),
      );

      expect(response.status).toBe(404);
    });

    /**
     * The gate this replaced sat in Express middleware and had to parse the request path itself.
     * There is no path to parse any more — the key arrives as a query parameter and
     * `resolvePrivateDocumentTarget()` rejects the traversal before Prisma or the disk is touched.
     */
    it("does not serve a traversal dressed as a listing key", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/documents/file")
        .query({ key: `listings/${LISTING}/../../sbr-private-docs-outside.txt` });

      expect(response.status).toBe(404);
      expect(response.text).not.toContain("outside the root");
    });
  });

  describe("keys that name nothing readable", () => {
    it.each([
      ["no key at all", ""],
      [
        "a traversal out of the owner's directory",
        `kyc/${OWNER}/../../sbr-private-docs-outside.txt`,
      ],
      ["an absolute path", "/etc/passwd"],
      // Since E3-S1d-3 there is no family the application writes that lands here — every prefix
      // has a policy, which is what let the mount go. This is the fall-through for a prefix
      // invented by a caller, or added by a future writer that forgot the policy table.
      ["a family this endpoint has no policy for", `invoices/${OWNER}/1700000000000_receipt.pdf`],
      ["a bare family prefix", "kyc/"],
      ["a key one segment short of a credential", `professionals/${PROFESSIONAL}/license`],
      ["a null byte", `kyc/${OWNER}/x\0.pdf`],
    ])("404s on %s", async (_label, key) => {
      currentUser = session(OWNER, UserRole.ADMIN);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/documents/file`)
        .query({ key });

      expect(response.status).toBe(404);
    });

    it("404s when the key is well-formed but the object is gone", async () => {
      currentUser = session(OWNER, UserRole.BUYER);

      const response = await request(app.getHttpServer()).get(
        url(`kyc/${OWNER}/1700000000000_deleted.pdf`),
      );

      expect(response.status).toBe(404);
    });

    it("decides authorization before storage, so a refused caller learns nothing about existence", async () => {
      currentUser = session(OTHER, UserRole.BUYER);

      const real = await request(app.getHttpServer()).get(url(KYC_KEY));
      const imaginary = await request(app.getHttpServer()).get(
        url(`kyc/${OWNER}/1700000000000_never-existed.pdf`),
      );

      expect(real.status).toBe(403);
      expect(imaginary.status).toBe(403);
    });
  });

  describe("how the bytes come back", () => {
    it("renders a PDF in the tab, under a filename taken from the key", async () => {
      currentUser = session(OWNER, UserRole.BUYER);

      const response = await request(app.getHttpServer()).get(url(KYC_KEY));

      expect(response.headers["content-type"]).toBe("application/pdf");
      expect(response.headers["content-disposition"]).toBe(
        'inline; filename="1700000000000_government-id.pdf"',
      );
    });

    it("downloads an uploaded .html instead of rendering it on the API origin", async () => {
      currentUser = session(OWNER, UserRole.BUYER);

      const response = await request(app.getHttpServer()).get(url(SMUGGLED_KEY));

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("application/octet-stream");
      expect(response.headers["content-disposition"]).toMatch(/^attachment;/);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("is never cached, because the decision was made for one caller", async () => {
      currentUser = session(OWNER, UserRole.BUYER);

      const response = await request(app.getHttpServer()).get(url(KYC_KEY));

      expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    });

    it("returns the file itself, not the { data } envelope every other route uses", async () => {
      currentUser = session(OWNER, UserRole.BUYER);

      const response = await download(KYC_KEY);

      expect(bytesOf(response)).toBe(KYC_BYTES);
      expect(response.headers["content-length"]).toBe(String(KYC_BYTES.length));
    });
  });

  describe("audit trail", () => {
    it("records who read which document", async () => {
      currentUser = session(OTHER, UserRole.STAFF);

      await request(app.getHttpServer()).get(url(KYC_KEY));

      expect(auditRows).toEqual([
        expect.objectContaining({
          actorId: OTHER,
          action: AuditAction.PRIVATE_DOCUMENT_READ,
          entity: "KycDocument",
          entityId: KYC_KEY,
          after: expect.objectContaining({ ownerId: OWNER, self: false, reason: "operator" }),
        }),
      ]);
    });

    /**
     * The reason matters most for this family: "who is this person to this document" is no longer
     * visible in the key, so without it the trail cannot distinguish a buyer reading their own
     * report from a professional reading a client's.
     */
    it("records why a due diligence reader was allowed", async () => {
      currentUser = session(ASSIGNED_PROFESSIONAL, UserRole.PROFESSIONAL);

      await request(app.getHttpServer()).get(url(DD_REPORT_KEY));

      expect(auditRows).toEqual([
        expect.objectContaining({
          actorId: ASSIGNED_PROFESSIONAL,
          action: AuditAction.PRIVATE_DOCUMENT_READ,
          entity: "DueDiligenceReport",
          entityId: DD_REPORT_KEY,
          after: expect.objectContaining({
            ownerId: DD_BUYER,
            self: false,
            reason: "assigned-professional",
          }),
        }),
      ]);
    });

    it("records the seller as a counterparty, not as the owner", async () => {
      currentUser = session(POA_SELLER, UserRole.SELLER);

      await request(app.getHttpServer()).get(url(POA_PDF_KEY));

      expect(auditRows).toEqual([
        expect.objectContaining({
          actorId: POA_SELLER,
          action: AuditAction.PRIVATE_DOCUMENT_READ,
          entity: "PowerOfAttorney",
          entityId: POA_PDF_KEY,
          after: expect.objectContaining({
            ownerId: POA_BUYER,
            self: false,
            reason: "transaction-counterparty",
          }),
        }),
      ]);
    });

    it("records a refusal too", async () => {
      currentUser = session(OTHER, UserRole.BUYER);

      await request(app.getHttpServer()).get(url(KYC_KEY));

      expect(auditRows).toEqual([
        expect.objectContaining({
          actorId: OTHER,
          action: AuditAction.PRIVATE_DOCUMENT_READ_DENIED,
          entity: "KycDocument",
          entityId: KYC_KEY,
        }),
      ]);
    });

    it("writes nothing for a key that names nothing", async () => {
      currentUser = session(OTHER, UserRole.BUYER);

      await request(app.getHttpServer()).get(url("invoices/abc/receipt.pdf"));

      expect(auditRows).toEqual([]);
    });

    /**
     * Public media is the one read that is not audited, because it is served on every marketplace
     * page view by every visitor and would bury the reads that matter under a row per image. The
     * refusal beside it is still recorded — that is the half worth keeping.
     */
    it("writes nothing for a public listing asset, but records the refusal next to it", async () => {
      await download(HERO_KEY);
      expect(auditRows).toEqual([]);

      await request(app.getHttpServer()).get(url(TITLE_DEED_KEY));

      expect(auditRows).toEqual([
        expect.objectContaining({
          actorId: null,
          action: AuditAction.PRIVATE_DOCUMENT_READ_DENIED,
          entity: "Document",
          entityId: TITLE_DEED_KEY,
          after: expect.objectContaining({ reason: "no-session", role: null }),
        }),
      ]);
    });
  });

  /**
   * The one header that changes with the decision. Everything else this endpoint sets is fixed,
   * but caching is the difference between a gallery image a CDN may hold for five minutes and a
   * title deed nothing in front of us may keep at all.
   */
  describe("cache headers", () => {
    it("lets a public listing asset be cached briefly", async () => {
      const response = await download(HERO_KEY);

      expect(response.headers["cache-control"]).toBe("public, max-age=300");
    });

    it.each([
      [
        "a title deed on the same listing",
        TITLE_DEED_KEY,
        () => session(LISTING_SELLER, UserRole.SELLER),
      ],
      ["a KYC document", KYC_KEY, () => session(OWNER, UserRole.BUYER)],
    ])("forbids caching %s", async (_label, key, actor) => {
      currentUser = actor();

      const response = await download(key);

      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    });
  });

  /**
   * E1-S3 criterion 2. A grant is the extra key stapled to a download link, and these cases ask
   * what happens when somebody presents one that is not theirs, not for this file, or no longer
   * good. The answer has to be 403 from this endpoint rather than the bytes, because the whole
   * point of a fifteen-minute link is that the sixteenth minute is different from the first.
   *
   * Every other test in this file sends no grant at all, which is the other half of the contract:
   * the parameter narrows a session and never replaces one.
   */
  describe("download grants (E1-S3)", () => {
    const grants = new DocumentGrantService();
    const granted = (key: string, token: string) =>
      `${url(key)}&grant=${encodeURIComponent(token)}`;

    it("serves the report when the buyer presents the grant they were issued", async () => {
      currentUser = session(DD_BUYER, UserRole.BUYER);
      const grant = grants.issue(DD_REPORT_KEY, DD_BUYER);

      const response = await request(app.getHttpServer())
        .get(granted(DD_REPORT_KEY, grant.token))
        .responseType("blob");

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(DD_REPORT_BYTES);
    });

    it("refuses an expired grant, and does not serve the file", async () => {
      currentUser = session(DD_BUYER, UserRole.BUYER);
      const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const stale = grants.issue(DD_REPORT_KEY, DD_BUYER, anHourAgo);

      const response = await request(app.getHttpServer()).get(granted(DD_REPORT_KEY, stale.token));

      expect(response.status).toBe(403);
      expect(response.text).not.toContain(DD_REPORT_BYTES);
    });

    it("refuses a grant minted for a different file on the same order", async () => {
      currentUser = session(DD_BUYER, UserRole.BUYER);
      const forAssignment = grants.issue(DD_ASSIGNMENT_KEY, DD_BUYER);

      const response = await request(app.getHttpServer()).get(
        granted(DD_REPORT_KEY, forAssignment.token),
      );

      expect(response.status).toBe(403);
    });

    it("refuses a grant issued to somebody else, even from a session that would otherwise pass", async () => {
      // An operator may read this report on their own session. Presenting the buyer's grant is a
      // forwarded link, and a forwarded link is the thing criterion 2 exists to stop.
      currentUser = session(OTHER, UserRole.STAFF);
      const buyersGrant = grants.issue(DD_REPORT_KEY, DD_BUYER);

      const response = await request(app.getHttpServer()).get(
        granted(DD_REPORT_KEY, buyersGrant.token),
      );

      expect(response.status).toBe(403);
    });

    it.each([
      ["nonsense", "not-a-grant"],
      ["an expiry with no signature", `${Date.now() + 60000}.`],
      ["a signature with no expiry", ".c2lnbmF0dXJl"],
      ["an expiry edited forward", `${Date.now() + 86400000}.c2lnbmF0dXJl`],
    ])("refuses %s", async (_label, token) => {
      currentUser = session(DD_BUYER, UserRole.BUYER);

      const response = await request(app.getHttpServer()).get(granted(DD_REPORT_KEY, token));

      expect(response.status).toBe(403);
    });

    it("is not a substitute for signing in", async () => {
      // No session, a perfectly good grant. Grants name an actor, and the actor on an anonymous
      // request is nobody, so this fails the signature check before the reader is ever consulted.
      currentUser = null;
      const grant = grants.issue(DD_REPORT_KEY, DD_BUYER);

      const response = await request(app.getHttpServer()).get(granted(DD_REPORT_KEY, grant.token));

      expect(response.status).toBe(403);
      expect(response.text).not.toContain(DD_REPORT_BYTES);
    });

    it("records the refusal, naming the key and why the grant failed", async () => {
      currentUser = session(DD_BUYER, UserRole.BUYER);
      const stale = grants.issue(DD_REPORT_KEY, DD_BUYER, new Date(Date.now() - 60 * 60 * 1000));

      await request(app.getHttpServer()).get(granted(DD_REPORT_KEY, stale.token));

      expect(auditRows).toEqual([
        expect.objectContaining({
          actorId: DD_BUYER,
          action: AuditAction.PRIVATE_DOCUMENT_READ_DENIED,
          entity: "DueDiligenceReport",
          entityId: DD_REPORT_KEY,
          after: expect.objectContaining({ reason: "grant-expired" }),
        }),
      ]);
    });

    it("leaves the answer to a request that carries no grant exactly as it was", async () => {
      currentUser = session(DD_BUYER, UserRole.BUYER);

      const response = await download(DD_REPORT_KEY);

      expect(response.status).toBe(200);
      expect(bytesOf(response)).toBe(DD_REPORT_BYTES);
    });
  });
});

describe("private document key parsing", () => {
  it("reads the owner out of a KYC key", () => {
    expect(resolvePrivateDocumentTarget(`kyc/${OWNER}/1700_id.pdf`)).toEqual({
      key: `kyc/${OWNER}/1700_id.pdf`,
      subjectId: OWNER,
      policy: expect.objectContaining({ subject: "user", auditEntity: "KycDocument" }),
    });
  });

  it("reads the owner out of a credential key, past the kind segment", () => {
    expect(resolvePrivateDocumentTarget(`professionals/${OWNER}/id/1700_passport.png`)).toEqual({
      key: `professionals/${OWNER}/id/1700_passport.png`,
      subjectId: OWNER,
      policy: expect.objectContaining({ subject: "user", auditEntity: "ProfessionalDocument" }),
    });
  });

  /**
   * The subject id here is an order, not a person, which is why the policy carries `subject`:
   * comparing this value to a session subject would be an authorization bug, not a stricter check.
   */
  it.each([
    ["a report", `due-diligence/${DD_ORDER}/reports/1700-report.pdf`],
    ["an assignment attachment", `due-diligence/${DD_ORDER}/assignments/${ASSIGNMENT}/1700-s.pdf`],
  ])("reads the order id out of %s key", (_label, key) => {
    expect(resolvePrivateDocumentTarget(key)).toEqual({
      key,
      subjectId: DD_ORDER,
      policy: expect.objectContaining({
        subject: "due-diligence-order",
        auditEntity: "DueDiligenceReport",
      }),
    });
  });

  /**
   * Same reason as the order id above: this names a transaction, not a person. `poa.service.ts`
   * builds these with `path.join`, so a Windows checkout produces backslashes and the parser has to
   * normalize them before the segment at index 1 means anything.
   */
  it.each([
    ["the deed", POA_PDF_KEY],
    ["its QR code", POA_QR_KEY],
  ])("reads the transaction id out of %s key", (_label, key) => {
    expect(resolvePrivateDocumentTarget(key)).toEqual({
      key,
      subjectId: POA_TX,
      policy: expect.objectContaining({
        subject: "transaction",
        auditEntity: "PowerOfAttorney",
      }),
    });
  });

  /**
   * The subject here is the listing, and the reader set behind it is the only one that admits a
   * caller with no session at all — which is why this family took a story of its own to route.
   */
  it("reads the listing id out of a listing document key", () => {
    expect(resolvePrivateDocumentTarget(HERO_KEY)).toEqual({
      key: HERO_KEY,
      subjectId: LISTING,
      policy: expect.objectContaining({
        subject: "listing-document",
        auditEntity: "Document",
      }),
    });
  });

  /**
   * The invariant E3-S1d-3 rests on, and the reason the mount could go: every key shape the
   * application writes is claimed by a policy, so `getSignedUrl()` routes all of them here and its
   * `/uploads/` fall-through is unreachable. The list is the writer call sites — `kyc.service.ts`,
   * `professionals.service.ts`, `standalone-dd.service.ts`, `poa.service.ts` and
   * `documents.service.ts` — and a sixth writer added without a policy entry fails here rather
   * than quietly emitting a URL for a mount that no longer exists.
   */
  it.each([
    ["KYC", KYC_KEY],
    ["professional credentials", LICENSE_KEY],
    ["due diligence reports", DD_REPORT_KEY],
    ["due diligence assignments", DD_ASSIGNMENT_KEY],
    ["powers of attorney", POA_PDF_KEY],
    ["power of attorney QR codes", POA_QR_KEY],
    ...LISTING_CATEGORIES.map(
      (entry) => [`listing ${entry.category}`, listingKey(LISTING, entry.file)] as const,
    ),
  ])("routes every %s key the application writes through this endpoint", (_label, key) => {
    expect(isPrivateDocumentKey(key)).toBe(true);
  });

  it("normalizes the backslashes and leading slashes a Windows client might send", () => {
    expect(resolvePrivateDocumentTarget(`/kyc\\${OWNER}\\1700_id.pdf`)?.key).toBe(
      `kyc/${OWNER}/1700_id.pdf`,
    );
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["a traversal", `kyc/${OWNER}/../../etc/passwd`],
    ["a bare dot segment", `kyc/${OWNER}/./id.pdf`],
    ["a double slash", `kyc//${OWNER}/id.pdf`],
    ["a null byte", `kyc/${OWNER}/id.pdf\0`],
    // Fails closed: a due diligence key that is not `due-diligence/<orderId>/…` names no order to
    // authorize against, so there is nothing to decide and the route answers 404. Since E3-S1d-3
    // there is no static mount left for it to fall through to either.
    ["a due diligence key one segment short", "due-diligence/abc/report.pdf"],
    ["a power of attorney key with no filename", `poa/${POA_TX}`],
  ])("rejects %s", (_label, key) => {
    expect(resolvePrivateDocumentTarget(key)).toBeNull();
  });

  it("percent-encodes the key into the URL, so a filename with a slash cannot escape it", () => {
    expect(privateDocumentUrl(`kyc/${OWNER}/1700_id.pdf`)).toBe(
      `/api/v1/documents/file?key=kyc%2F${OWNER}%2F1700_id.pdf`,
    );
  });
});

describe("private document delivery", () => {
  it.each([
    ["scan.pdf", "application/pdf", "inline"],
    ["photo.JPG", "image/jpeg", "inline"],
    ["photo.jpeg", "image/jpeg", "inline"],
    ["shot.png", "image/png", "inline"],
    ["card.webp", "image/webp", "inline"],
    ["scan.tiff", "image/tiff", "attachment"],
    ["page.html", "application/octet-stream", "attachment"],
    ["page.svg", "application/octet-stream", "attachment"],
    ["archive", "application/octet-stream", "attachment"],
  ])("serves %s as %s (%s)", (name, contentType, disposition) => {
    const delivery = describePrivateDocument(`kyc/${OWNER}/${name}`);

    expect(delivery.contentType).toBe(contentType);
    expect(delivery.disposition).toBe(disposition);
  });

  it("never lets a quote out of the filename and into the header", () => {
    const delivery = describePrivateDocument(`kyc/${OWNER}/a"; filename="b.pdf`);

    expect(delivery.fileName).not.toContain('"');
  });
});
