import {
  CanActivate,
  Controller,
  Get,
  Injectable,
  Module,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { configureApp } from "../app-bootstrap";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateDocumentController } from "./private-document.controller";
import { StorageService } from "./storage.service";

/**
 * E3-S1a, executable proof of the document exposure.
 *
 * configureApp() mounts `/uploads` as Express static middleware ahead of the Nest router.
 * Guards only run once the Nest router has matched a route, so nothing a controller declares can
 * protect that path: before E3-S1b, any storage key fetched a title deed, a government ID, a KYC
 * selfie or a due diligence report with no session at all.
 *
 * The app under test uses the real configureApp() rather than a hand-copied replica, so the
 * middleware order being probed is production's. Its module denies *every* Nest request, which
 * is what makes the result unambiguous — see the control case.
 *
 * E3-S1b closed the delivery half: a gate in front of the mount now resolves each key to its
 * Document row and serves only public listing imagery, so probe two lost `.failing` and is a
 * regression test.
 *
 * E3-S1c closed probe one for the KYC and professional credential families. getSignedUrl() no
 * longer resolves a private key to a static path at all — it resolves to PrivateDocumentController,
 * which is a Nest route, which is the side of the router where guards run. That is precisely what
 * this module proves: it denies every request the router handles, so a private document URL
 * answering 401 here means the URL now passes through the guard layer instead of around it.
 * What the real guard then decides is `private-document.controller.spec.ts`.
 */

/** A private document. The point of the story is that this needs a session and does not get one. */
const STORAGE_KEY = "kyc/9f31a7/government-id.pdf";
const DOCUMENT_BYTES = "private document bytes";

@Injectable()
class DenyEveryRequestGuard implements CanActivate {
  canActivate(): boolean {
    throw new UnauthorizedException();
  }
}

@Controller("probe")
class ProbeController {
  @Get()
  get(): { ok: boolean } {
    return { ok: true };
  }
}

/**
 * The KYC key under probe has no Document row — nothing outside listing documents does. Stubbed
 * rather than connected because this suite must not need the shared cloud Postgres, and because
 * "no row" is exactly what the real database would answer for it.
 */
const noPublicDocuments = { document: { findFirst: () => Promise.resolve(null) } };

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
  // The real controller, so probe one asks the application's own route rather than a stand-in.
  controllers: [ProbeController, PrivateDocumentController],
  providers: [
    StorageService,
    { provide: PrismaService, useValue: noPublicDocuments },
    { provide: AuditService, useValue: { log: () => Promise.resolve() } },
    { provide: APP_GUARD, useClass: DenyEveryRequestGuard },
  ],
})
class DenyEverythingModule {}

describe("unauthenticated /uploads exposure (E3-S1)", () => {
  let app: NestExpressApplication;
  let storage: StorageService;
  let uploadRoot: string;
  const originalEnv = {
    storageLocalPath: process.env.STORAGE_LOCAL_PATH,
    uploadDir: process.env.UPLOAD_DIR,
    storageDriver: process.env.STORAGE_DRIVER,
  };

  beforeAll(async () => {
    // A temp root, so the probe neither reads nor needs the repo's ./uploads directory.
    uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sbr-uploads-probe-"));
    fs.mkdirSync(path.join(uploadRoot, path.dirname(STORAGE_KEY)), { recursive: true });
    fs.writeFileSync(path.join(uploadRoot, STORAGE_KEY), DOCUMENT_BYTES);

    process.env.STORAGE_LOCAL_PATH = uploadRoot;
    process.env.STORAGE_DRIVER = "local";
    delete process.env.UPLOAD_DIR;

    const moduleRef = await Test.createTestingModule({
      imports: [DenyEverythingModule],
    }).compile();

    storage = moduleRef.get(StorageService);
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
  });

  /**
   * The control. Without it, a failing probe could just mean "this app has no guard anywhere",
   * which would prove nothing. This app rejects every request the Nest router handles.
   */
  it("denies an unauthenticated request to a Nest route, so the guard really is wired", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/probe");

    expect(response.status).toBe(401);
  });

  /**
   * Probe one, the authorization decision. **Closed by E3-S1c** — `.failing` dropped.
   *
   * Deliberately follows StorageService.getSignedUrl() rather than hardcoding a path, so it
   * probes whatever URL the application actually hands out for a private document. It fails
   * again the moment any driver starts resolving a private key to something that is served
   * without a session — a static path, or a presigned URL carrying its own authority.
   *
   * Asserts on the guard, not the payload. Whether the file exists on disk decides only between
   * 200 and 404, and both would mean the request was answered without anyone checking who was
   * asking.
   */
  it("refuses an unauthenticated request for the URL a private document resolves to", async () => {
    const url = await storage.getSignedUrl(STORAGE_KEY);

    const response = await request(app.getHttpServer()).get(url);

    expect([401, 403]).toContain(response.status);
  });

  /**
   * Probe two, the static mount itself. **Closed by E3-S1b** — `.failing` dropped, this is now
   * the regression test, and it fails if the gate in front of the mount is ever removed or
   * widened to serve a key with no public Document row.
   *
   * Probe one alone could not have seen this fix, because an unmatched or gated path answers 404
   * and 404 is not 401 — that assertion keeps failing for a new reason and `.failing` would have
   * stayed green through the whole story. This one asserts on delivery instead: the bytes must
   * not come back, however the mount is closed.
   */
  it("does not serve the document bytes from the unauthenticated static mount", async () => {
    const response = await request(app.getHttpServer()).get(`/uploads/${STORAGE_KEY}`);

    expect(response.status).not.toBe(200);
    expect(response.text).not.toContain(DOCUMENT_BYTES);
  });
});
