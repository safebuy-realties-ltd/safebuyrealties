import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Test, TestingModule } from "@nestjs/testing";
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
