import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ListingStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { CreateInspectionRequestDto } from "./dto/create-inspection-request.dto";
import { PatchInspectionSlotDto } from "./dto/patch-inspection-slot.dto";

@Injectable()
export class InspectionsService {
  constructor(private prisma: PrismaService) {}

  async createForListing(listingId: string, dto: CreateInspectionRequestDto, actor: JwtPayload) {
    if (actor.role !== UserRole.BUYER) {
      throw new ForbiddenException("Only buyers can request inspections");
    }

    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.status !== ListingStatus.LIVE) {
      throw new BadRequestException("Inspections can only be requested for live listings");
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException("Invalid scheduledAt");
    }

    const slot = await this.prisma.inspectionSlot.create({
      data: {
        listingId,
        requestedById: actor.sub,
        scheduledAt,
        notes: dto.notes?.trim() || null,
      },
    });

    return this.serialize(slot);
  }

  async listForListing(listingId: string, actor: JwtPayload) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Listing not found");

    const isStaff = actor.role === UserRole.STAFF || actor.role === UserRole.ADMIN;
    const isSeller = listing.sellerId === actor.sub;
    const isBuyer = actor.role === UserRole.BUYER;

    if (!isStaff && !isSeller && !isBuyer) {
      throw new ForbiddenException();
    }

    const where = isStaff || isSeller ? { listingId } : { listingId, requestedById: actor.sub };

    const slots = await this.prisma.inspectionSlot.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
    });

    return slots.map((s) => this.serialize(s));
  }

  async patch(id: string, dto: PatchInspectionSlotDto, actor: JwtPayload) {
    const slot = await this.prisma.inspectionSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException("Inspection slot not found");

    const isStaff = actor.role === UserRole.STAFF || actor.role === UserRole.ADMIN;
    if (!isStaff) {
      throw new ForbiddenException("Only staff can update inspection slots");
    }

    if (dto.professionalId) {
      const pro = await this.prisma.user.findUnique({ where: { id: dto.professionalId } });
      if (!pro || pro.role !== UserRole.PROFESSIONAL) {
        throw new BadRequestException("professionalId must be a professional user");
      }
    }

    const updated = await this.prisma.inspectionSlot.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.outcome !== undefined ? { outcome: dto.outcome } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.professionalId !== undefined ? { professionalId: dto.professionalId } : {}),
      },
    });

    return this.serialize(updated);
  }

  async listQueue(actor: JwtPayload) {
    if (actor.role !== UserRole.STAFF && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    const slots = await this.prisma.inspectionSlot.findMany({
      where: { status: { in: ["REQUESTED", "CONFIRMED"] } },
      orderBy: { scheduledAt: "asc" },
      include: {
        listing: { select: { id: true, title: true, location: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return slots.map((s) => ({
      ...this.serialize(s),
      listingTitle: s.listing.title,
      listingLocation: s.listing.location,
      requesterName: `${s.requestedBy.firstName} ${s.requestedBy.lastName}`.trim(),
      requesterEmail: s.requestedBy.email,
    }));
  }

  async listForBuyerTransactions(buyerId: string) {
    const slots = await this.prisma.inspectionSlot.findMany({
      where: { requestedById: buyerId },
      orderBy: { scheduledAt: "desc" },
      include: { listing: { select: { id: true, title: true, location: true } } },
    });

    return slots.map((s) => ({
      ...this.serialize(s),
      listingTitle: s.listing.title,
      listingLocation: s.listing.location,
    }));
  }

  private serialize(s: {
    id: string;
    listingId: string;
    professionalId: string | null;
    requestedById: string;
    scheduledAt: Date;
    status: string;
    outcome: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: s.id,
      listingId: s.listingId,
      professionalId: s.professionalId,
      requestedById: s.requestedById,
      scheduledAt: s.scheduledAt.toISOString(),
      status: s.status,
      outcome: s.outcome,
      notes: s.notes,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}
