import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Module,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { configureApp } from "../app-bootstrap";
import { AuditService, AuditLogInput } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateDocumentAuthorizer } from "./private-document-authorizer";
import { PrivateDocumentController } from "./private-document.controller";
import { StorageService } from "./storage.service";
import {
  describePrivateDocument,
  privateDocumentUrl,
  resolvePrivateDocumentTarget,
} from "./private-documents";

/**
 * E3-S1c and E3-S1d-1: what the authorized reader actually decides.
 *
 * `uploads-exposure.spec.ts` proves the private document URL is a Nest route rather than a static
 * path, which is the structural half. This is the other half — with a real session, who gets the
 * bytes. The app is built with the real configureApp(), so the global prefix, exception filter and
 * response interceptor are production's; only the session is substituted.
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

const KYC_KEY = `kyc/${OWNER}/1700000000000_government-id.pdf`;
const KYC_BYTES = "government ID scan";
const LICENSE_KEY = `professionals/${PROFESSIONAL}/license/1700000000000_licence.jpg`;
const LICENSE_BYTES = "surveyor licence";
/** Both due diligence key shapes, exactly as standalone-dd.service.ts:1107 and :1275 build them. */
const DD_REPORT_KEY = `due-diligence/${DD_ORDER}/reports/1700000000000-report.pdf`;
const DD_REPORT_BYTES = "due diligence report";
const DD_ASSIGNMENT_KEY = `due-diligence/${DD_ORDER}/assignments/${ASSIGNMENT}/1700000000000-survey.pdf`;
const DD_ASSIGNMENT_BYTES = "surveyor findings";
/** No upload path validates a MIME type yet (that is E3-S3), so this is reachable today. */
const SMUGGLED_KEY = `kyc/${OWNER}/1700000000001_selfie.html`;
const SMUGGLED_BYTES = "<script>fetch('/api/v1/users/me')</script>";

function session(sub: string, role: UserRole): JwtPayload {
  return { sub, email: `${sub}@example.test`, role, professionalType: null };
}

/** Set per test; null means "no session at all". */
let currentUser: JwtPayload | null = null;

@Injectable()
class StubSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!currentUser) throw new UnauthorizedException();
    context.switchToHttp().getRequest<{ user?: JwtPayload }>().user = currentUser;
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

const prismaStub = {
  // Only the /uploads gate reaches for this, and it never resolves a private key.
  document: { findFirst: () => Promise.resolve(null) },
  dueDiligenceOrder: {
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(dueDiligenceOrders[where.id] ?? null),
  },
};

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
  controllers: [PrivateDocumentController],
  providers: [
    StorageService,
    PrivateDocumentAuthorizer,
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

describe("authorized private document access (E3-S1c, E3-S1d-1)", () => {
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
    write(SMUGGLED_KEY, SMUGGLED_BYTES);
    fs.writeFileSync(path.join(os.tmpdir(), "sbr-private-docs-outside.txt"), "outside the root");

    process.env.STORAGE_LOCAL_PATH = uploadRoot;
    process.env.STORAGE_DRIVER = "local";
    delete process.env.UPLOAD_DIR;

    const moduleRef = await Test.createTestingModule({
      imports: [PrivateDocumentTestModule],
    })
      .overrideGuard(JwtAuthGuard)
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

  describe("keys that name nothing readable", () => {
    it.each([
      ["no key at all", ""],
      [
        "a traversal out of the owner's directory",
        `kyc/${OWNER}/../../sbr-private-docs-outside.txt`,
      ],
      ["an absolute path", "/etc/passwd"],
      [
        "a family this endpoint has no policy for",
        `listings/${OWNER}/1700000000000_title-deed.pdf`,
      ],
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

      await request(app.getHttpServer()).get(url("listings/abc/deed.pdf"));

      expect(auditRows).toEqual([]);
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
    ["a public family", "listings/abc/hero.jpg"],
    // Fails closed: a due diligence key that is not `due-diligence/<orderId>/…` names no order to
    // authorize against, so it keeps its /uploads URL and stays 404 behind the E3-S1b gate.
    ["a due diligence key one segment short", "due-diligence/abc/report.pdf"],
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
