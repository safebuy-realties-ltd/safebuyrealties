import { Test, TestingModule } from "@nestjs/testing";
import { ListingStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { privateDocumentUrl } from "../storage/private-documents";
import { PlatformConfigService } from "../platform-config/platform-config.service";
import { DocumentsService } from "./documents.service";
import { JwtPayload } from "../auth/jwt.strategy";

const seller: JwtPayload = {
  sub: "seller-1",
  email: "seller@safebuyrealties.test",
  role: UserRole.SELLER,
  professionalType: null,
};

describe("DocumentsService", () => {
  let service: DocumentsService;
  let storage: { upload: jest.Mock; getSignedUrl: jest.Mock };
  let platformConfig: { getMaxUploadBytes: jest.Mock };
  let prisma: {
    listing: { findUnique: jest.Mock };
    document: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    storage = {
      upload: jest.fn().mockResolvedValue("listings/L1/1_deed.pdf"),
      // The real `getSignedUrl` decides between the authorized reader and a driver URL; the part
      // that matters here is the string the DTO carries, so the stub builds it with the same pure
      // helper the service's collaborator does rather than a hand-typed literal.
      getSignedUrl: jest.fn((key: string) => Promise.resolve(privateDocumentUrl(key))),
    };
    platformConfig = {
      getMaxUploadBytes: jest.fn().mockResolvedValue(15 * 1024 * 1024),
    };
    prisma = {
      listing: {
        findUnique: jest.fn().mockResolvedValue({
          id: "L1",
          sellerId: "seller-1",
          status: ListingStatus.DRAFT,
        }),
      },
      document: {
        create: jest.fn().mockResolvedValue({
          id: "doc-1",
          listingId: "L1",
          category: "title",
          fileName: "deed.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4,
          storageKey: "listings/L1/1_deed.pdf",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: PlatformConfigService, useValue: platformConfig },
      ],
    }).compile();

    service = module.get(DocumentsService);
  });

  it("createFromUpload delegates file bytes to StorageService.upload", async () => {
    const file = {
      originalname: "deed.pdf",
      mimetype: "application/pdf",
      size: 4,
      buffer: Buffer.from("data"),
    } as Express.Multer.File;

    const result = await service.createFromUpload("L1", "title", file, seller);

    expect(result).toHaveProperty("url", privateDocumentUrl("listings/L1/1_deed.pdf"));
    expect(result).not.toHaveProperty("storageKey");
    expect(storage.upload).toHaveBeenCalledTimes(1);
    const [buffer, key, mimeType] = storage.upload.mock.calls[0];
    expect(buffer).toEqual(Buffer.from("data"));
    expect(key).toMatch(/^listings\/L1\/\d+_deed\.pdf$/);
    expect(mimeType).toBe("application/pdf");
    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storageKey: "listings/L1/1_deed.pdf" }),
      }),
    );
  });

  /**
   * E3-S1d-3 turned this test inside out, and the old shape is worth stating because the inversion
   * looks like a loosening and is the opposite.
   *
   * This used to assert that a buyer got `storageKey` for a hero image and not for a title deed —
   * the serializer was the access control, because the key it withheld was an unauthenticated
   * pointer to the bytes under `/uploads/`. Every actor now gets a `url` for every document they
   * can list, and none of them get a key: the URL names `PrivateDocumentController`, which decides
   * per request from the live session. Holding it grants nothing, so withholding it protects
   * nothing — it only broke the buyer's view of documents they were entitled to see.
   *
   * Who may actually read the title deed is decided in `private-document.controller.spec.ts`,
   * which is now the only place that decision is made.
   */
  it("gives a buyer a reader URL for every document, and a storage key for none", async () => {
    const buyer: JwtPayload = {
      sub: "buyer-1",
      email: "buyer@safebuyrealties.test",
      role: UserRole.BUYER,
      professionalType: null,
    };
    prisma.listing.findUnique.mockResolvedValue({
      id: "L1",
      sellerId: "seller-1",
      status: ListingStatus.LIVE,
    });
    prisma.document.findMany.mockResolvedValue([
      {
        id: "doc-hero",
        listingId: "L1",
        category: "listing_hero",
        fileName: "hero.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        storageKey: "listings/L1/hero.jpg",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "doc-title",
        listingId: "L1",
        category: "title_deed",
        fileName: "deed.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4,
        storageKey: "listings/L1/deed.pdf",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const docs = await service.listByListing("L1", buyer);

    expect(docs[0]).toHaveProperty("url", privateDocumentUrl("listings/L1/hero.jpg"));
    expect(docs[1]).toHaveProperty("url", privateDocumentUrl("listings/L1/deed.pdf"));
    expect(docs.every((doc) => !("storageKey" in doc))).toBe(true);
    // Nothing in the payload is a path into storage — not under another name, and not inside the
    // URL, which carries the key percent-encoded behind the route that authorizes it.
    expect(JSON.stringify(docs)).not.toContain("listings/L1/deed.pdf");
  });
});
