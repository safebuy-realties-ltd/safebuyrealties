import { BadRequestException, ForbiddenException, HttpStatus } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { JwtPayload } from "../auth/jwt.strategy";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { KYC_GATED_ACTIONS, KYC_GATE_FLAG, KycRequiredException } from "../kyc/kyc-gate";
import { KycStatus } from "../kyc/kyc.constants";
import { PrismaService } from "../prisma/prisma.service";
import { isPrivateDocumentKey, resolvePrivateDocumentTarget } from "../storage/private-documents";
import { StorageService } from "../storage/storage.service";
import { PoaService, PowerOfAttorneyResponse } from "./poa.service";

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
  let storage: { upload: jest.Mock; getSignedUrl: jest.Mock };
  let flags: { isEnabled: jest.Mock };
  let prisma: {
    transaction: { findUnique: jest.Mock };
    powerOfAttorney: { create: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(async () => {
    storage = {
      upload: jest
        .fn()
        .mockImplementation((_buf: Buffer, key: string) =>
          Promise.resolve(key.replace(/\\/g, "/")),
        ),
      // Deliberately not the real URL: the assertions below prove the response carries whatever
      // StorageService returned, and a separate test proves what it returns for a POA key.
      getSignedUrl: jest.fn().mockImplementation((key: string) => Promise.resolve(`signed:${key}`)),
    };
    prisma = {
      transaction: { findUnique: jest.fn() },
      powerOfAttorney: { create: jest.fn(), findUnique: jest.fn() },
    };
    // Off is the registry default for kyc_gate, so this is what production reads today and what the
    // rest of this file assumes. The gate's own describe block arms it.
    flags = { isEnabled: jest.fn().mockReturnValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoaService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: FeatureFlagsService, useValue: flags },
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

  /**
   * E3-S1d-2. Before this, `execute()` handed back the raw storage keys, and every one of them
   * resolved under the public `/uploads` mount — an executed power of attorney readable with no
   * session at all, plus a QR image that verifies it to whoever holds the picture.
   */
  describe("what the response discloses about the stored documents", () => {
    async function executeOnce(): Promise<PowerOfAttorneyResponse> {
      prisma.transaction.findUnique.mockResolvedValue({
        id: "tx-1",
        buyerId: "buyer-1",
        listingId: "listing-1",
        powerOfAttorney: null,
        buyer: { firstName: "Ada", lastName: "Obi" },
        listing: { title: "4-Bed Duplex", location: "Lekki Phase 1, Lagos" },
      });
      prisma.powerOfAttorney.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: "poa-1", ...data, ipAddress: null, userAgent: null }),
      );

      return service.execute(
        { transactionId: "tx-1", signatureMethod: "TYPED", signatureName: "Ada Obi", consentFlags },
        buyer,
      );
    }

    it("returns URLs from StorageService rather than the keys it stored", async () => {
      const result = await executeOnce();

      const stored = prisma.powerOfAttorney.create.mock.calls[0][0].data;
      expect(storage.getSignedUrl).toHaveBeenCalledWith(stored.pdfStorageKey);
      expect(storage.getSignedUrl).toHaveBeenCalledWith(stored.qrCodeStorageKey);
      expect(result.pdfUrl).toBe(`signed:${stored.pdfStorageKey}`);
      expect(result.qrCodeUrl).toBe(`signed:${stored.qrCodeStorageKey}`);
    });

    it("carries no storage key under any field name", async () => {
      const result = await executeOnce();

      const stored = prisma.powerOfAttorney.create.mock.calls[0][0].data;
      const body = JSON.stringify(result);
      expect(Object.keys(result)).not.toContain("pdfStorageKey");
      expect(Object.keys(result)).not.toContain("qrCodeStorageKey");
      // `signed:` is the stub's prefix, so a bare key would fail this even under a matching name.
      expect(body).not.toContain(`"${stored.pdfStorageKey}"`);
      expect(body).not.toContain(`"${stored.qrCodeStorageKey}"`);
    });

    /**
     * The stub above proves the service delegates; this proves the delegation lands somewhere that
     * checks a session. Both keys are asserted against the real routing table, so adding a segment
     * to either key shape without adding a policy fails here rather than in production.
     */
    it("builds both keys into a family the private reader owns", async () => {
      await executeOnce();

      const keys = storage.upload.mock.calls.map((call) => call[1].replace(/\\/g, "/"));
      expect(keys).toHaveLength(2);
      for (const key of keys) {
        expect(key.startsWith("poa/tx-1/")).toBe(true);
        expect(isPrivateDocumentKey(key)).toBe(true);
        expect(resolvePrivateDocumentTarget(key)).toEqual(
          expect.objectContaining({
            subjectId: "tx-1",
            policy: expect.objectContaining({
              subject: "transaction",
              auditEntity: "PowerOfAttorney",
            }),
          }),
        );
      }
    });
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

  /**
   * E4-S2 criterion 3. The purchase wizard hides this step behind a button it will not render for an
   * unverified buyer, and that is worth exactly nothing to anyone holding the URL. These tests drive
   * `execute()` directly, which is the path the request takes, and prove the answer is the same.
   */
  describe("the KYC gate on execution (E4-S2 criterion 3)", () => {
    function transactionWithKyc(status: string | null): Record<string, unknown> {
      return {
        id: "tx-1",
        buyerId: "buyer-1",
        listingId: "listing-1",
        powerOfAttorney: null,
        buyer: {
          firstName: "Ada",
          lastName: "Obi",
          kycRecord: status === null ? null : { status },
        },
        listing: { title: "4-Bed Duplex", location: "Lekki Phase 1, Lagos" },
      };
    }

    function executeAsBuyer(): Promise<PowerOfAttorneyResponse> {
      prisma.powerOfAttorney.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: "poa-1", ...data, ipAddress: null, userAgent: null }),
      );
      return service.execute(
        { transactionId: "tx-1", signatureMethod: "TYPED", signatureName: "Ada Obi", consentFlags },
        buyer,
      );
    }

    describe("with the gate armed", () => {
      beforeEach(() => {
        flags.isEnabled.mockReturnValue(true);
      });

      it.each([KycStatus.NOT_SUBMITTED, KycStatus.SUBMITTED, KycStatus.REJECTED])(
        "refuses a buyer whose KYC is %s",
        async (status) => {
          prisma.transaction.findUnique.mockResolvedValue(transactionWithKyc(status));

          await expect(executeAsBuyer()).rejects.toBeInstanceOf(KycRequiredException);
        },
      );

      it("treats a buyer with no KYC record at all as not submitted rather than as fine", async () => {
        prisma.transaction.findUnique.mockResolvedValue(transactionWithKyc(null));

        await expect(executeAsBuyer()).rejects.toBeInstanceOf(KycRequiredException);
      });

      it("refuses with 403 and a reason naming the step, not the policy", async () => {
        prisma.transaction.findUnique.mockResolvedValue(transactionWithKyc(KycStatus.SUBMITTED));

        await executeAsBuyer().then(
          () => fail("expected the gate to refuse"),
          (error: KycRequiredException) => {
            expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
            expect(error.getResponse()).toMatchObject({
              error: "KYC_REQUIRED",
              message: KYC_GATED_ACTIONS.POA_EXECUTION.blockedReason,
              details: { action: "POA_EXECUTION", kycStatus: KycStatus.SUBMITTED },
            });
          },
        );
      });

      it("signs nothing, stores nothing and uploads nothing when it refuses", async () => {
        prisma.transaction.findUnique.mockResolvedValue(transactionWithKyc(KycStatus.REJECTED));

        await expect(executeAsBuyer()).rejects.toBeInstanceOf(KycRequiredException);

        expect(storage.upload).not.toHaveBeenCalled();
        expect(prisma.powerOfAttorney.create).not.toHaveBeenCalled();
      });

      it("executes for a verified buyer", async () => {
        prisma.transaction.findUnique.mockResolvedValue(transactionWithKyc(KycStatus.VERIFIED));

        await expect(executeAsBuyer()).resolves.toMatchObject({ id: "poa-1" });
      });

      it("reads the buyer's KYC status in the query it was already making", async () => {
        prisma.transaction.findUnique.mockResolvedValue(transactionWithKyc(KycStatus.VERIFIED));

        await executeAsBuyer();

        expect(prisma.transaction.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.transaction.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.objectContaining({
              buyer: { include: { kycRecord: { select: { status: true } } } },
            }),
          }),
        );
      });
    });

    it("lets an unverified buyer through with the gate off, which is the demo setting", async () => {
      flags.isEnabled.mockReturnValue(false);
      prisma.transaction.findUnique.mockResolvedValue(transactionWithKyc(KycStatus.NOT_SUBMITTED));

      await expect(executeAsBuyer()).resolves.toMatchObject({ id: "poa-1" });
    });

    it("reads one flag to decide, and it is the one the story named", async () => {
      prisma.transaction.findUnique.mockResolvedValue(transactionWithKyc(KycStatus.VERIFIED));

      await executeAsBuyer();

      expect(flags.isEnabled.mock.calls).toEqual([[KYC_GATE_FLAG]]);
    });
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
