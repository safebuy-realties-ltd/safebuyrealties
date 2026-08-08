import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Test, TestingModule } from "@nestjs/testing";
import { BadGatewayException, BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { StorageService } from "./storage.service";

describe("StorageService (local driver)", () => {
  let service: StorageService;
  let rootDir: string;

  beforeEach(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sbr-storage-"));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "STORAGE_DRIVER") return "local";
              if (key === "STORAGE_LOCAL_PATH") return rootDir;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get(StorageService);
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it("upload writes file under storage root and returns normalized key", async () => {
    const key = await service.upload(
      Buffer.from("hello"),
      "listings/abc/deed.pdf",
      "application/pdf",
    );

    expect(key).toBe("listings/abc/deed.pdf");
    const abs = path.join(rootDir, "listings", "abc", "deed.pdf");
    expect(fs.readFileSync(abs, "utf8")).toBe("hello");
  });

  /**
   * E3-S1d-3 inverted this one. A listing key used to come back as `/uploads/…` for the frontend
   * to render directly, which is exactly how a title deed reached the public: the URL was a
   * durable pointer to the bytes, valid to anyone holding it, and the only thing deciding whether
   * to hand it over was the client. It now names the authorized reader, like every other family.
   */
  it("routes a listing key to the authorized reader, not to a static path", async () => {
    const url = await service.getSignedUrl("listings/abc/1700_photo.jpg");
    expect(url).toBe("/api/v1/documents/file?key=listings%2Fabc%2F1700_photo.jpg");
  });

  it("routes a private key to the authorized reader instead of the static mount", async () => {
    const url = await service.getSignedUrl("kyc/user-1/1700_government-id.pdf");
    expect(url).toBe("/api/v1/documents/file?key=kyc%2Fuser-1%2F1700_government-id.pdf");
  });

  /**
   * The failure mode, kept deliberately. No prefix this application writes lands here any more —
   * `private-document.controller.spec.ts` asserts that over every writer's key shape — so a
   * `/uploads/` URL now means a family was added without a policy entry. It points at a mount
   * E3-S1d-3 deleted, so it 404s, which is how a missing policy should fail. `expiresInSeconds`
   * rides along because the local driver has no expiry to respect and never did.
   */
  it("hands an unrouted key a /uploads URL for a mount that no longer exists", async () => {
    const url = await service.getSignedUrl("a.png", 3600);
    expect(url).toBe("/uploads/a.png");
  });

  /**
   * E3-S1d-1. Both due diligence key shapes route to the reader, and a key predating the
   * `<orderId>` layout does not: it names no order to authorize against, so it fails closed to
   * the unrouted path above and 404s.
   */
  it.each([
    ["due-diligence/order-1/reports/1700-report.pdf", true],
    ["due-diligence/order-1/assignments/assign-1/1700-survey.pdf", true],
    ["due-diligence/legacy-report.pdf", false],
  ])("routes %s to the authorized reader: %s", async (key, routed) => {
    const url = await service.getSignedUrl(key);

    expect(url.startsWith("/api/v1/documents/file?key=")).toBe(routed);
  });

  it("readObject returns the bytes and the length for a stored key", async () => {
    const key = "kyc/user-1/1700_government-id.pdf";
    await service.upload(Buffer.from("private bytes"), key, "application/pdf");

    const object = await service.readObject(key);

    expect(object.contentLength).toBe("private bytes".length);
    const chunks: Buffer[] = [];
    for await (const chunk of object.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString("utf8")).toBe("private bytes");
  });

  it("readObject 404s on a missing key rather than throwing ENOENT at the client", async () => {
    await expect(service.readObject("kyc/user-1/gone.pdf")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("readObject 404s on a directory, which fs would otherwise stream as an error", async () => {
    await service.upload(Buffer.from("x"), "kyc/user-1/1700_id.pdf", "application/pdf");

    await expect(service.readObject("kyc/user-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * normalizeKey() rejects `..` outright, so this never reaches the filesystem. The resolve check
   * inside readObjectLocal is the backstop behind it, for any future key shape that gets past here.
   */
  it("readObject refuses to escape the storage root", async () => {
    const outside = path.join(os.tmpdir(), "sbr-storage-outside.txt");
    fs.writeFileSync(outside, "outside");
    try {
      await expect(service.readObject("../sbr-storage-outside.txt")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.readObject("/etc/passwd")).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it("rejects storage keys containing path traversal segments", async () => {
    await expect(
      service.upload(Buffer.from("x"), "listings/../escape.txt", "text/plain"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("delete removes the stored file", async () => {
    const key = "listings/x/file.txt";
    await service.upload(Buffer.from("x"), key, "text/plain");
    const abs = path.join(rootDir, "listings", "x", "file.txt");
    expect(fs.existsSync(abs)).toBe(true);

    await service.delete(key);
    expect(fs.existsSync(abs)).toBe(false);
  });
});

/**
 * E3-S2a decoupled these two from `process.env.VERCEL` without changing what they do there. The
 * question is now whether the filesystem survives the process, which an operator can answer on a
 * host that has never heard of Vercel, and `VERCEL` is only the fallback until the cutover.
 */
describe("StorageService (ephemeral filesystem)", () => {
  const scratch = path.join("/tmp", "safebuyrealties-uploads");

  async function serviceWith(
    env: Record<string, string>,
    config: Record<string, string | undefined> = {},
  ) {
    const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    try {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
        ],
      }).compile();
      return module.get(StorageService);
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("uses /tmp on Vercel when no local path is configured", async () => {
    const service = await serviceWith({ VERCEL: "1" });

    await service.upload(Buffer.from("v"), "vercel-check.txt", "text/plain");

    expect(fs.existsSync(path.join(scratch, "vercel-check.txt"))).toBe(true);
    await service.delete("vercel-check.txt");
  });

  it("uses /tmp when an operator declares the filesystem ephemeral, with no vendor involved", async () => {
    const service = await serviceWith({ STORAGE_EPHEMERAL_FS: "true" });

    await service.upload(Buffer.from("d"), "declared-check.txt", "text/plain");

    expect(fs.existsSync(path.join(scratch, "declared-check.txt"))).toBe(true);
    await service.delete("declared-check.txt");
  });

  /**
   * The relative path is the one that has to be redirected: `./uploads` resolves inside a bundle
   * that is read-only or discarded. An absolute path is an operator saying where the bytes go, and
   * is honoured as written.
   */
  it("redirects a relative configured path but honours an absolute one", async () => {
    const relative = await serviceWith({ VERCEL: "1" }, { STORAGE_LOCAL_PATH: "./uploads" });
    await relative.upload(Buffer.from("r"), "relative-check.txt", "text/plain");
    expect(fs.existsSync(path.join(scratch, "relative-check.txt"))).toBe(true);
    await relative.delete("relative-check.txt");

    const absoluteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sbr-absolute-"));
    const absolute = await serviceWith({ VERCEL: "1" }, { STORAGE_LOCAL_PATH: absoluteRoot });
    await absolute.upload(Buffer.from("a"), "absolute-check.txt", "text/plain");
    expect(fs.existsSync(path.join(absoluteRoot, "absolute-check.txt"))).toBe(true);
    fs.rmSync(absoluteRoot, { recursive: true, force: true });
  });

  it("uses the configured path on an ordinary host, where nothing is ephemeral", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sbr-durable-"));
    const service = await serviceWith({ STORAGE_EPHEMERAL_FS: "false" }, { UPLOAD_DIR: root });

    await service.upload(Buffer.from("k"), "durable-check.txt", "text/plain");

    expect(fs.existsSync(path.join(root, "durable-check.txt"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("StorageService (s3 driver)", () => {

  /**
   * The sharp edge of E3-S1c. A presigned URL is a bearer capability — an hour of access to
   * whoever holds it, with no session and no role check — so it cannot express "the owner and
   * platform operators only". This service is configured for s3 with no credentials at all: if the
   * private check did not come first, presigning would be attempted and this would throw.
   */
  it("never presigns a private key, even on the s3 driver", async () => {
    const service = new StorageService({
      get: (key: string) => (key === "STORAGE_DRIVER" ? "s3" : undefined),
    } as unknown as ConfigService);

    await expect(service.getSignedUrl("kyc/user-1/1700_government-id.pdf")).resolves.toBe(
      "/api/v1/documents/file?key=kyc%2Fuser-1%2F1700_government-id.pdf",
    );
    await expect(
      service.getSignedUrl("professionals/user-1/license/1700_licence.jpg"),
    ).resolves.toBe(
      "/api/v1/documents/file?key=professionals%2Fuser-1%2Flicense%2F1700_licence.jpg",
    );
    await expect(
      service.getSignedUrl("due-diligence/order-1/reports/1700-report.pdf"),
    ).resolves.toBe(
      "/api/v1/documents/file?key=due-diligence%2Forder-1%2Freports%2F1700-report.pdf",
    );
  });

  /**
   * E3-S2a inverted this one. A half-configured bucket used to come back as a 400 naming both
   * variables, which blamed the caller for a server fault and told anyone who could reach an upload
   * what this deployment was missing. It is a 502 now, and the variable names go to the log.
   * `assertStorageConfigured()` refuses to boot production in this state, so the only way to reach
   * here at all is a development or staging box configured halfway.
   */
  it("raises a 502 naming nothing when required S3 settings are missing", async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === "STORAGE_DRIVER" ? "s3" : undefined),
          },
        },
      ],
    }).compile();

    const service = module.get(StorageService);
    const failure = await service.upload(Buffer.from("x"), "k", "text/plain").catch((e) => e);

    expect(failure).toBeInstanceOf(BadGatewayException);
    expect(failure.getStatus()).toBe(502);
    expect(JSON.stringify(failure.getResponse())).not.toMatch(/AWS_/);
  });
});

/**
 * E3-S2 criteria 3 and 6, the halves of them that are code rather than bucket configuration.
 *
 * `S3Client.prototype.send` is spied on rather than a client being injected, because the service
 * builds its own client inside `getS3()` and the point of these tests is what it puts on the wire.
 */
describe("StorageService (s3 durability and failure mapping)", () => {
  const S3_CONFIG: Record<string, string> = {
    STORAGE_DRIVER: "s3",
    AWS_REGION: "af-south-1",
    AWS_S3_BUCKET: "sbr-documents",
    AWS_ACCESS_KEY_ID: "AKIA_EXAMPLE",
    AWS_SECRET_ACCESS_KEY: "secret-example",
  };

  function make(overrides: Record<string, string | undefined> = {}): StorageService {
    const config = { ...S3_CONFIG, ...overrides };
    return new StorageService({ get: (key: string) => config[key] } as unknown as ConfigService);
  }

  let send: jest.SpyInstance;

  beforeEach(() => {
    send = jest.spyOn(S3Client.prototype, "send");
  });

  afterEach(() => {
    send.mockRestore();
  });

  function lastPut(): Record<string, unknown> {
    const command = send.mock.calls.at(-1)?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    return command.input as unknown as Record<string, unknown>;
  }

  it("encrypts every object it writes, without being asked to", async () => {
    send.mockResolvedValue({});

    await make().upload(Buffer.from("deed"), "listings/abc/deed.pdf", "application/pdf");

    expect(lastPut().ServerSideEncryption).toBe("AES256");
  });

  it("uses a managed key when one is configured", async () => {
    send.mockResolvedValue({});

    await make({ AWS_S3_SSE: "aws:kms", AWS_S3_SSE_KMS_KEY_ID: "key-1" }).upload(
      Buffer.from("deed"),
      "listings/abc/deed.pdf",
      "application/pdf",
    );

    expect(lastPut()).toMatchObject({ ServerSideEncryption: "aws:kms", SSEKMSKeyId: "key-1" });
  });

  it("falls back to AES256 on a value it does not recognise, because that is the safe direction", async () => {
    send.mockResolvedValue({});

    await make({ AWS_S3_SSE: "aes-256" }).upload(Buffer.from("x"), "listings/a/b.pdf", "text/plain");

    expect(lastPut().ServerSideEncryption).toBe("AES256");
  });

  it("sends no encryption header only when an operator switches it off outright", async () => {
    send.mockResolvedValue({});

    await make({ AWS_S3_SSE: "none" }).upload(Buffer.from("x"), "listings/a/b.pdf", "text/plain");

    expect(lastPut().ServerSideEncryption).toBeUndefined();
  });

  it.each([
    ["upload", (s: StorageService) => s.upload(Buffer.from("x"), "listings/a/b.pdf", "text/plain")],
    ["read", (s: StorageService) => s.readObject("listings/a/b.pdf")],
    ["delete", (s: StorageService) => s.delete("listings/a/b.pdf")],
  ])("maps an unreachable bucket on %s to a 502 rather than an unhandled 500", async (_op, act) => {
    send.mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED sbr-documents.s3.af-south-1.amazonaws.com"), {
        name: "NetworkingError",
      }),
    );

    const failure = await act(make()).catch((e) => e);

    expect(failure).toBeInstanceOf(BadGatewayException);
    expect(failure.getStatus()).toBe(502);
  });

  it("tells the caller nothing about the bucket it could not reach", async () => {
    send.mockRejectedValue(new Error("Access Denied for bucket sbr-documents"));

    const failure = await make().readObject("listings/a/b.pdf").catch((e) => e);

    expect(JSON.stringify(failure.getResponse())).not.toContain("sbr-documents");
  });

  /**
   * The distinction the mapping turns on. A missing key is this service answering correctly and
   * has to stay a 404; if it became a 502 then every deleted document would read as an outage.
   */
  it("still answers 404 for a key that is not there", async () => {
    send.mockRejectedValue(Object.assign(new Error("no such key"), { name: "NoSuchKey" }));

    await expect(make().readObject("listings/a/gone.pdf")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("StorageService.configStatus", () => {
  function make(env: Record<string, string | undefined>): StorageService {
    return new StorageService({ get: (key: string) => env[key] } as unknown as ConfigService);
  }

  it("is ok for the local driver", () => {
    expect(make({ STORAGE_DRIVER: "local" }).configStatus()).toEqual({ ok: true });
  });

  it("is ok for a fully configured s3 driver", () => {
    const status = make({
      STORAGE_DRIVER: "s3",
      AWS_REGION: "eu-central-1",
      AWS_S3_BUCKET: "sbr-documents",
      AWS_ACCESS_KEY_ID: "AKIA_EXAMPLE",
      AWS_SECRET_ACCESS_KEY: "secret",
    }).configStatus();

    expect(status).toEqual({ ok: true });
  });

  it("fails when the s3 driver has no bucket", () => {
    expect(make({ STORAGE_DRIVER: "s3", AWS_REGION: "eu-central-1" }).configStatus()).toEqual({
      ok: false,
      reason: "s3_missing_region_or_bucket",
    });
  });

  it("fails when the s3 driver has no region", () => {
    expect(make({ STORAGE_DRIVER: "s3", AWS_S3_BUCKET: "sbr-documents" }).configStatus()).toEqual({
      ok: false,
      reason: "s3_missing_region_or_bucket",
    });
  });

  it("fails on half a credential pair, which getS3 would silently drop", () => {
    expect(
      make({
        STORAGE_DRIVER: "s3",
        AWS_REGION: "eu-central-1",
        AWS_S3_BUCKET: "sbr-documents",
        AWS_ACCESS_KEY_ID: "AKIA_EXAMPLE",
      }).configStatus(),
    ).toEqual({ ok: false, reason: "s3_partial_credentials" });
  });

  it("reports no configuration values, only a fixed reason", () => {
    const serialized = JSON.stringify(
      make({ STORAGE_DRIVER: "s3", AWS_S3_BUCKET: "sbr-secret-bucket" }).configStatus(),
    );

    expect(serialized).not.toContain("sbr-secret-bucket");
  });
});
