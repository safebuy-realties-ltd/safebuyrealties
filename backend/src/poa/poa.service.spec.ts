import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { JwtPayload } from "../auth/jwt.strategy";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PoaService } from "./poa.service";

const hash64 = "a".repeat(64);

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const buyer: JwtPayload = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};

const consentFlags = {
  legalCapacity: true,
  witnessingRequired: true,
  landRegistryRegistration: true,
  irrevocability: true,
};

describe("PoaService", () => {
  let service: PoaService;
  let storage: { upload: jest.Mock };
  let prisma: {
    transaction: { findUnique: jest.Mock };
    powerOfAttorney: { create: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(async () => {
    storage = {
      upload: jest
        .fn()
        .mockImplementation((_buf: Buffer, key: string) => Promise.resolve(key.replace(/\\/g, "/"))),
    };
    prisma = {
      transaction: { findUnique: jest.fn() },
      powerOfAttorney: { create: jest.fn(), findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoaService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(PoaService);
  });

  it("computeDocumentHash returns SHA-256 hex of the buffer", () => {
    const buffer = Buffer.from("sample-pdf-content");
    const expected = createHash("sha256").update(buffer).digest("hex");
    expect(service.computeDocumentHash(buffer)).toBe(expected);
    expect(service.computeDocumentHash(buffer)).toHaveLength(64);
  });

  describe("buildVerifyUrl", () => {
    const saved = {
      base: process.env.POA_VERIFY_BASE_URL,
      frontend: process.env.FRONTEND_URL,
    };

    afterEach(() => {
      restoreEnv("POA_VERIFY_BASE_URL", saved.base);
      restoreEnv("FRONTEND_URL", saved.frontend);
    });

    it("falls back to the safebuyrealties verify endpoint when nothing is configured", () => {
      delete process.env.POA_VERIFY_BASE_URL;
      delete process.env.FRONTEND_URL;

      const hash = "abc123";
      expect(service.buildVerifyUrl(hash)).toBe(`https://safebuyrealties.com/verify?hash=${hash}`);
    });

    it("honours POA_VERIFY_BASE_URL ahead of FRONTEND_URL", () => {
      process.env.POA_VERIFY_BASE_URL = "https://staging.safebuyrealties.com/verify";
      process.env.FRONTEND_URL = "https://ignored.example.com";

      expect(service.buildVerifyUrl(hash64)).toBe(
        `https://staging.safebuyrealties.com/verify?hash=${hash64}`,
      );
    });

    it("derives the base from the first FRONTEND_URL origin", () => {
      delete process.env.POA_VERIFY_BASE_URL;
      process.env.FRONTEND_URL = "https://safebuyrealties-app.vercel.app,http://localhost:8080";

      expect(service.buildVerifyUrl(hash64)).toBe(
        `https://safebuyrealties-app.vercel.app/verify?hash=${hash64}`,
      );
    });

    it("produces a QR target that resolves to a live frontend route", () => {
      delete process.env.POA_VERIFY_BASE_URL;
      delete process.env.FRONTEND_URL;

      // buildVerifyUrl is the exact string handed to QRCode.toBuffer in execute()
      // (poa.service.ts, `const verifyUrl = this.buildVerifyUrl(documentHash)`).
      const url = new URL(service.buildVerifyUrl(hash64));
      expect(url.pathname).toBe("/verify");
      expect(url.searchParams.get("hash")).toBe(hash64);

      // The generated route tree is what the frontend actually mounts, so matching
      // against it proves the QR target is a real page rather than a 404.
      const routeTree = readFileSync(
        join(__dirname, "..", "..", "..", "src", "routeTree.gen.ts"),
        "utf8",
      );
      expect(routeTree).toContain(`path: '${url.pathname}'`);
    });
  });

  it("generate produces a non-empty PDF buffer", async () => {
    const pdf = await service.generate(
      "Ada Obi",
      "4-Bed Duplex",
      "Lekki Phase 1, Lagos",
      new Date("2026-05-26T12:00:00.000Z"),
      "Ada Obi",
      "TYPED",
      consentFlags,
    );
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(100);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("execute uploads PDF and QR via StorageService and stores the record", async () => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: "tx-1",
      buyerId: "buyer-1",
      listingId: "listing-1",
      powerOfAttorney: null,
      buyer: { firstName: "Ada", lastName: "Obi" },
      listing: { title: "4-Bed Duplex", location: "Lekki Phase 1, Lagos" },
    });
    prisma.powerOfAttorney.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: "poa-1",
        ...data,
        ipAddress: null,
        userAgent: null,
      }),
    );

    const result = await service.execute(
      {
        transactionId: "tx-1",
        signatureMethod: "TYPED",
        signatureName: "Ada Obi",
        consentFlags,
      },
      buyer,
      { ipAddress: "127.0.0.1", userAgent: "jest" },
    );

    expect(storage.upload).toHaveBeenCalledTimes(2);
    const pdfUpload = storage.upload.mock.calls[0];
    const qrUpload = storage.upload.mock.calls[1];
    expect(pdfUpload[2]).toBe("application/pdf");
    expect(qrUpload[2]).toBe("image/png");
    expect(pdfUpload[0].subarray(0, 4).toString()).toBe("%PDF");

    const hash = service.computeDocumentHash(pdfUpload[0]);
    expect(result.documentHash).toBe(hash);
    expect(prisma.powerOfAttorney.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: "tx-1",
          buyerId: "buyer-1",
          documentHash: hash,
          signatureMethod: "TYPED",
        }),
      }),
    );
  });

  it("execute rejects when consent flags are incomplete", async () => {
    await expect(
      service.execute(
        {
          transactionId: "tx-1",
          signatureMethod: "TYPED",
          signatureName: "Ada Obi",
          consentFlags: { ...consentFlags, legalCapacity: false },
        },
        buyer,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
  });

  it("execute rejects non-buyer actors", async () => {
    const seller: JwtPayload = { ...buyer, role: UserRole.SELLER };
    await expect(
      service.execute(
        {
          transactionId: "tx-1",
          signatureMethod: "TYPED",
          signatureName: "Ada Obi",
          consentFlags,
        },
        seller,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("verifyByHash returns confirmation for a known hash", async () => {
    prisma.powerOfAttorney.findUnique.mockResolvedValue({
      documentHash: hash64,
      signatureMethod: "DRAWN",
      executedAt: new Date("2026-05-26T12:00:00.000Z"),
      listing: { title: "4-Bed Duplex", location: "Lekki Phase 1, Lagos" },
    });

    const result = await service.verifyByHash(hash64);
    expect(result).toEqual({
      verified: true,
      documentHash: hash64,
      listingTitle: "4-Bed Duplex",
      listingAddress: "Lekki Phase 1, Lagos",
      executedAt: "2026-05-26T12:00:00.000Z",
    });
  });

  it("verifyByHash discloses nothing beyond the property, date and hash", async () => {
    prisma.powerOfAttorney.findUnique.mockResolvedValue({
      documentHash: hash64,
      signatureMethod: "DRAWN",
      signatureName: "Ada Obi",
      buyerId: "buyer-1",
      transactionId: "txn-1",
      pdfStorageKey: "poa/txn-1/deed.pdf",
      executedAt: new Date("2026-05-26T12:00:00.000Z"),
      buyer: { firstName: "Ada", lastName: "Obi", email: "ada@example.test" },
      listing: { title: "4-Bed Duplex", location: "Lekki Phase 1, Lagos", price: "250000000" },
    });

    const result = await service.verifyByHash(hash64);

    expect(Object.keys(result).sort()).toEqual([
      "documentHash",
      "executedAt",
      "listingAddress",
      "listingTitle",
      "verified",
    ]);
    expect(JSON.stringify(result)).not.toContain("Ada");
    expect(JSON.stringify(result)).not.toContain("ada@example.test");
    expect(JSON.stringify(result)).not.toContain("250000000");

    // The buyer relation is not even loaded, so it cannot leak by accident.
    expect(prisma.powerOfAttorney.findUnique).toHaveBeenCalledWith({
      where: { documentHash: hash64 },
      include: { listing: { select: { title: true, location: true } } },
    });
  });
});
