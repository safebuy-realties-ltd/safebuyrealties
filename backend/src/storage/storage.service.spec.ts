import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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

  it("getSignedUrl returns /uploads/{key} for local driver", async () => {
    const url = await service.getSignedUrl("listings/abc/photo.jpg");
    expect(url).toBe("/uploads/listings/abc/photo.jpg");
  });

  it("getSignedUrl respects custom expiresInSeconds (local ignores it)", async () => {
    const url = await service.getSignedUrl("a.png", 3600);
    expect(url).toBe("/uploads/a.png");
  });

  it("routes a private key to the authorized reader instead of the static mount", async () => {
    const url = await service.getSignedUrl("kyc/user-1/1700_government-id.pdf");
    expect(url).toBe("/api/v1/documents/file?key=kyc%2Fuser-1%2F1700_government-id.pdf");
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

describe("StorageService (s3 driver)", () => {
  it("uses /tmp on Vercel when no local path is configured", async () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: { get: () => undefined },
          },
        ],
      }).compile();
      const service = module.get(StorageService);
      await service.upload(Buffer.from("v"), "vercel-check.txt", "text/plain");
      const abs = path.join("/tmp", "safebuyrealties-uploads", "vercel-check.txt");
      expect(fs.existsSync(abs)).toBe(true);
      await service.delete("vercel-check.txt");
    } finally {
      if (prev === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prev;
    }
  });

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
  });

  it("throws when required S3 env vars are missing", async () => {
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
    await expect(service.upload(Buffer.from("x"), "k", "text/plain")).rejects.toThrow(
      /AWS_S3_BUCKET|AWS_REGION/,
    );
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
