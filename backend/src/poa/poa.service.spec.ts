import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import { createHash } from "crypto";
import { JwtPayload } from "../auth/jwt.strategy";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PoaService } from "./poa.service";

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

  it("buildVerifyUrl encodes the safebuyrealties verify endpoint", () => {
    const hash = "abc123";
    expect(service.buildVerifyUrl(hash)).toBe(`https://safebuyrealties.com/verify?hash=${hash}`);
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
      documentHash: "a".repeat(64),
      signatureMethod: "DRAWN",
      executedAt: new Date("2026-05-26T12:00:00.000Z"),
      buyer: { firstName: "Ada", lastName: "Obi" },
      listing: { title: "4-Bed Duplex", location: "Lekki Phase 1, Lagos" },
    });

    const result = await service.verifyByHash("a".repeat(64));
    expect(result.verified).toBe(true);
    expect(result.buyerName).toBe("Ada Obi");
    expect(result.listingTitle).toBe("4-Bed Duplex");
  });
});
