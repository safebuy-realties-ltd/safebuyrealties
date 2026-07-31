import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { ListingStatus } from "@prisma/client";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { configureApp } from "../app-bootstrap";
import { PrismaService } from "../prisma/prisma.service";
import { storageKeyFromRequestPath } from "./public-listing-asset.gate";

/**
 * E3-S1b. The gate in front of the `/uploads` static mount.
 *
 * The case that matters is the second one below. Every category a seller uploads lands under the
 * same `listings/<listingId>/` prefix — a title deed sits beside the hero image, one directory
 * apart from nothing — so a mount narrowed by prefix would still have served the land title
 * documents to anyone. These tests pin the boundary to the Document category instead, which is
 * the only place the stored data records what a file actually is.
 */

const LIVE_LISTING = "11111111-1111-1111-1111-111111111111";
const DRAFT_LISTING = "22222222-2222-2222-2222-222222222222";

const HERO_KEY = `listings/${LIVE_LISTING}/1700000000000_hero.jpg`;
const GALLERY_KEY = `listings/${LIVE_LISTING}/1700000000001_garden.jpg`;
const TITLE_DEED_KEY = `listings/${LIVE_LISTING}/1700000000002_certificate-of-occupancy.pdf`;
const SURVEY_PLAN_KEY = `listings/${LIVE_LISTING}/1700000000003_survey.pdf`;
const UNPUBLISHED_HERO_KEY = `listings/${DRAFT_LISTING}/1700000000004_hero.jpg`;
const KYC_KEY = "kyc/9f31a7/government-id.pdf";

const SECRET = "PRIVATE DOCUMENT CONTENTS";
const PUBLIC_BYTES = "public listing photo";

type DocumentRow = {
  storageKey: string;
  category: string;
  listing: { status: ListingStatus; isPublished: boolean };
};

const LIVE = { status: ListingStatus.LIVE, isPublished: true };
const DRAFT = { status: ListingStatus.DRAFT, isPublished: false };

/** Every Document row that exists. Note all five listing rows share one storage prefix. */
const DOCUMENTS: DocumentRow[] = [
  { storageKey: HERO_KEY, category: "listing_hero", listing: LIVE },
  { storageKey: GALLERY_KEY, category: "listing_gallery", listing: LIVE },
  { storageKey: TITLE_DEED_KEY, category: "title_deed", listing: LIVE },
  { storageKey: SURVEY_PLAN_KEY, category: "survey_plan", listing: LIVE },
  { storageKey: UNPUBLISHED_HERO_KEY, category: "listing_hero", listing: DRAFT },
];

/**
 * A faithful stand-in for the one query the gate makes, so the suite needs no database. It
 * applies the gate's own `where` to the fixture rows rather than pattern-matching the call, which
 * is what keeps it from flattering the gate: widen the category filter and these tests notice.
 */
type FindFirstArgs = { where: { storageKey: string; category: { in: readonly string[] } } };
const prismaStub = {
  document: {
    findFirst: ({ where }: FindFirstArgs) =>
      Promise.resolve(
        DOCUMENTS.find(
          (doc) => doc.storageKey === where.storageKey && where.category.in.includes(doc.category),
        ) ?? null,
      ),
  },
};

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
  providers: [{ provide: PrismaService, useValue: prismaStub }],
})
class GateTestModule {}

/** Whatever came back, in whatever form supertest parsed it. */
function deliveredBody(response: request.Response): string {
  return `${response.text ?? ""}${Buffer.isBuffer(response.body) ? response.body.toString() : ""}`;
}

describe("public listing asset gate (E3-S1b)", () => {
  let app: NestExpressApplication;
  let uploadRoot: string;
  const originalEnv = {
    storageLocalPath: process.env.STORAGE_LOCAL_PATH,
    uploadDir: process.env.UPLOAD_DIR,
  };

  beforeAll(async () => {
    uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sbr-asset-gate-"));
    const write = (key: string, contents: string) => {
      fs.mkdirSync(path.join(uploadRoot, path.dirname(key)), { recursive: true });
      fs.writeFileSync(path.join(uploadRoot, key), contents);
    };
    // Every file exists on disk. Only the gate decides which ones come back.
    write(HERO_KEY, PUBLIC_BYTES);
    write(GALLERY_KEY, PUBLIC_BYTES);
    write(TITLE_DEED_KEY, SECRET);
    write(SURVEY_PLAN_KEY, SECRET);
    write(UNPUBLISHED_HERO_KEY, PUBLIC_BYTES);
    write(KYC_KEY, SECRET);

    process.env.STORAGE_LOCAL_PATH = uploadRoot;
    delete process.env.UPLOAD_DIR;

    const moduleRef = await Test.createTestingModule({ imports: [GateTestModule] }).compile();
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
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  });

  it("serves a hero image on a publicly visible listing", async () => {
    const response = await request(app.getHttpServer()).get(`/uploads/${HERO_KEY}`);

    expect(response.status).toBe(200);
    expect(deliveredBody(response)).toContain(PUBLIC_BYTES);
  });

  it("serves a gallery image on a publicly visible listing", async () => {
    const response = await request(app.getHttpServer()).get(`/uploads/${GALLERY_KEY}`);

    expect(response.status).toBe(200);
  });

  /**
   * The whole point. Same listing, same storage prefix, one directory listing apart from the hero
   * image that is served two tests above — and it must not come back.
   */
  it.each([
    ["a title deed", TITLE_DEED_KEY],
    ["a survey plan", SURVEY_PLAN_KEY],
  ])("does not serve %s stored under the same listings/ prefix", async (_label, key) => {
    const response = await request(app.getHttpServer()).get(`/uploads/${key}`);

    expect(response.status).toBe(404);
    expect(deliveredBody(response)).not.toContain(SECRET);
  });

  it("does not serve a hero image whose listing is not publicly visible", async () => {
    const response = await request(app.getHttpServer()).get(`/uploads/${UNPUBLISHED_HERO_KEY}`);

    expect(response.status).toBe(404);
  });

  it("does not serve a key with no Document row at all, such as a KYC document", async () => {
    const response = await request(app.getHttpServer()).get(`/uploads/${KYC_KEY}`);

    expect(response.status).toBe(404);
    expect(deliveredBody(response)).not.toContain(SECRET);
  });

  it("does not serve a traversal out of the upload root", async () => {
    const response = await request(app.getHttpServer()).get("/uploads/../../etc/passwd");

    expect(response.status).not.toBe(200);
  });

  describe("storageKeyFromRequestPath", () => {
    it("recovers the stored key from the path under the mount", () => {
      expect(storageKeyFromRequestPath(`/${HERO_KEY}`)).toBe(HERO_KEY);
    });

    it("decodes percent-encoded file names, which uploads produce", () => {
      expect(storageKeyFromRequestPath("/listings/abc/1_a%20photo.jpg")).toBe(
        "listings/abc/1_a photo.jpg",
      );
    });

    it.each([
      ["the mount root", "/"],
      ["a traversal segment", "/listings/../../etc/passwd"],
      ["a bare dot segment", "/listings/./abc.jpg"],
      ["malformed encoding", "/listings/%E0%A4%A.jpg"],
      ["a null byte", "/listings/abc%00.jpg"],
    ])("rejects %s", (_label, requestPath) => {
      expect(storageKeyFromRequestPath(requestPath)).toBeNull();
    });
  });
});
