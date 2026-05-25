import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, ListingStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { JwtPayload } from "../auth/jwt.strategy";
import * as path from "path";

const MAX_BYTES = 15 * 1024 * 1024;

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  private isStaff(role: UserRole) {
    return role === UserRole.STAFF || role === UserRole.ADMIN;
  }

  async getListingOrThrow(listingId: string, actor: JwtPayload) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.sellerId === actor.sub || this.isStaff(actor.role)) return listing;
    if (actor.role === UserRole.BUYER && listing.status === ListingStatus.LIVE) return listing;
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
    if (file.size > MAX_BYTES) throw new ForbiddenException("File too large (max 15MB)");

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
    return {
      id: doc.id,
      listingId: doc.listingId,
      category: doc.category,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      storageKey: doc.storageKey,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  async listByListing(listingId: string, actor: JwtPayload) {
    await this.getListingOrThrow(listingId, actor);
    const docs = await this.prisma.document.findMany({
      where: { listingId },
      orderBy: { createdAt: "desc" },
    });
    return docs.map((d) => ({
      id: d.id,
      listingId: d.listingId,
      category: d.category,
      fileName: d.fileName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      storageKey: d.storageKey,
      createdAt: d.createdAt.toISOString(),
    }));
  }
}
