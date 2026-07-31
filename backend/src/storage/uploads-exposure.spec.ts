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
import { StorageService } from "./storage.service";

/**
 * E3-S1a, executable proof of the document exposure.
 *
 * configureApp() mounts `/uploads` as Express static middleware ahead of the Nest router
 * (app-bootstrap.ts:31). Guards only run once the Nest router has matched a route, so nothing
 * a controller declares can protect that path: any storage key fetches a title deed, a
 * government ID, a KYC selfie or a due diligence report with no session at all.
 *
 * The app under test uses the real configureApp() rather than a hand-copied replica, so the
 * middleware order being probed is production's. Its module denies *every* Nest request, which
 * is what makes the result unambiguous — see the control case.
 *
 * Both probes are `it.failing`, so CI stays green today and turns red the moment E3-S1 closes
 * the hole. They then become the regression test: drop `.failing`.
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

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
  controllers: [ProbeController],
  providers: [StorageService, { provide: APP_GUARD, useClass: DenyEveryRequestGuard }],
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
   * Probe one, the authorization decision.
   *
   * Deliberately follows StorageService.getSignedUrl() rather than hardcoding `/uploads`, so it
   * probes whatever URL the application actually hands out for a private document. That is the
   * link to E3-S1: the moment getSignedUrl() returns an authorized path for the local driver,
   * this asks that path for the document with no session, and the answer becomes a refusal.
   *
   * Asserts on the guard, not the payload. Whether the file exists on disk decides only between
   * 200 and 404, and both mean the request was answered without anyone checking who was asking.
   */
  it.failing(
    "refuses an unauthenticated request for the URL a private document resolves to",
    async () => {
      const url = await storage.getSignedUrl(STORAGE_KEY);

      const response = await request(app.getHttpServer()).get(url);

      expect([401, 403]).toContain(response.status);
    },
  );

  /**
   * Probe two, the static mount itself.
   *
   * Probe one alone cannot see a fix that retires `/uploads` without replacing it, because an
   * unmatched Nest path answers 404 and 404 is not 401 — the assertion would keep failing for a
   * new reason and the `.failing` marker would stay green. This one closes that gap by asserting
   * on delivery instead: the bytes must not come back, whether the mount is guarded or removed.
   */
  it.failing(
    "does not serve the document bytes from the unauthenticated static mount",
    async () => {
      const response = await request(app.getHttpServer()).get(`/uploads/${STORAGE_KEY}`);

      expect(response.status).not.toBe(200);
      expect(response.text).not.toContain(DOCUMENT_BYTES);
    },
  );
});
