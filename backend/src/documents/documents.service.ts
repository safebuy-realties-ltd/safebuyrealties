import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PlatformConfigService } from "../platform-config/platform-config.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { isInternalRole } from "../common/user-roles";
import { isPubliclyVisible } from "../listings/listings-public.helper";
import { isPublicListingAssetCategory } from "./document-categories";
import * as path from "path";

const PUBLIC_DOCUMENT_CATEGORIES: Record<string, string> = {
  survey_plan: "Survey Plan",
  deed_of_assignment: "Deed of Assignment",
  cof_o: "Certificate of Occupancy",
  governors_consent: "Governor's Consent",
  building_approval: "Building Approval",
  other: "Other Document",
};

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private platformConfig: PlatformConfigService,
  ) {}

  private isStaff(role: UserRole) {
    return isInternalRole(role);
  }

  private toDocumentDto(
    doc: {
      id: string;
      listingId: string;
      category: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
      createdAt: Date;
    },
    actor: JwtPayload,
  ) {
    const base = {
      id: doc.id,
      listingId: doc.listingId,
      category: doc.category,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt.toISOString(),
    };
    if (actor.role === UserRole.BUYER && !isPublicListingAssetCategory(doc.category)) {
      return base;
    }
    return { ...base, storageKey: doc.storageKey };
  }

  async getListingOrThrow(listingId: string, actor: JwtPayload) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.sellerId === actor.sub || this.isStaff(actor.role)) return listing;
    if (actor.role === UserRole.BUYER && isPubliclyVisible(listing)) return listing;
    if (actor.role === UserRole.PROFESSIONAL) {
      const [v, t] = await Promise.all([
        this.prisma.verificationStep.count({
          where: { listingId, assignedProfessionalId: actor.sub },
        }),
        this.prisma.task.count({ where: { listingId, assigneeId: actor.sub } }),
      ]);
      if (v + t > 0) return listing;
    }
    throw new ForbiddenException();
  }

  async createFromUpload(
    listingId: string,
    category: string,
    file: Express.Multer.File,
    actor: JwtPayload,
  ) {
    await this.getListingOrThrow(listingId, actor);
    if (!file?.size) throw new BadRequestException("File is required");

    const maxBytes = await this.platformConfig.getMaxUploadBytes();
    if (file.size > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      throw new ForbiddenException(`File too large (max ${maxMb}MB)`);
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = await this.storage.upload(
      file.buffer,
      path.join("listings", listingId, `${Date.now()}_${safeName}`),
      file.mimetype,
    );

    const doc = await this.prisma.document.create({
      data: {
        listingId,
        uploadedById: actor.sub,
        category,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
      },
    });
    return this.toDocumentDto(doc, actor);
  }

  async listByListing(listingId: string, actor: JwtPayload) {
    await this.getListingOrThrow(listingId, actor);
    const docs = await this.prisma.document.findMany({
      where: { listingId },
      orderBy: { createdAt: "desc" },
    });
    return docs.map((d) => this.toDocumentDto(d, actor));
  }

  async listPublicDocumentNames(listingId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (!isPubliclyVisible(listing)) throw new NotFoundException("Listing not found");

    const categories = Object.keys(PUBLIC_DOCUMENT_CATEGORIES);
    const docs = await this.prisma.document.findMany({
      where: { listingId, category: { in: categories } },
      orderBy: { createdAt: "asc" },
      select: { category: true, fileName: true },
    });

    return docs.map((doc) => ({
      category: doc.category,
      name: PUBLIC_DOCUMENT_CATEGORIES[doc.category] ?? doc.fileName,
    }));
  }
}
