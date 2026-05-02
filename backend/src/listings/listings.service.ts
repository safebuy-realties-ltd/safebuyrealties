import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  ListingStatus,
  UserRole,
  Prisma,
  VerificationStepType,
  VerificationStepStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { CreateListingDto } from "./dto/create-listing.dto";
import { UpdateListingDto } from "./dto/update-listing.dto";
import { ListListingsQueryDto } from "./dto/list-listings.query";

const VERIFICATION_TEMPLATE: { type: VerificationStepType; order: number }[] = [
  { type: VerificationStepType.SUBMISSION, order: 0 },
  { type: VerificationStepType.DOCUMENT_REVIEW, order: 1 },
  { type: VerificationStepType.FIELD_VERIFICATION, order: 2 },
  { type: VerificationStepType.LEGAL, order: 3 },
  { type: VerificationStepType.SURVEY, order: 4 },
  { type: VerificationStepType.VALUATION, order: 5 },
  { type: VerificationStepType.RISK_REVIEW, order: 6 },
  { type: VerificationStepType.FINAL_APPROVAL, order: 7 },
];

@Injectable()
export class ListingsService {
  constructor(private prisma: PrismaService) {}

  private serializeListing(
    l: {
      id: string;
      sellerId: string;
      title: string;
      description: string;
      location: string;
      price: Prisma.Decimal;
      currency: string;
      status: ListingStatus;
      verifiedAt: Date | null;
      rejectionReason: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    seller?: { firstName: string; lastName: string } | null,
  ) {
    const sellerName = seller
      ? `${seller.firstName} ${seller.lastName}`.trim() || undefined
      : undefined;
    return {
      id: l.id,
      sellerId: l.sellerId,
      sellerName,
      title: l.title,
      description: l.description,
      location: l.location,
      price: l.price.toString(),
      currency: l.currency,
      status: l.status,
      verifiedAt: l.verifiedAt?.toISOString() ?? null,
      rejectionReason: l.rejectionReason,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    };
  }

  private isStaff(role: UserRole) {
    return role === UserRole.STAFF || role === UserRole.ADMIN;
  }

  async create(dto: CreateListingDto, actor: JwtPayload) {
    if (
      actor.role !== UserRole.SELLER &&
      actor.role !== UserRole.STAFF &&
      actor.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException("Only sellers and staff can create listings");
    }
    let sellerId = actor.sub;
    if (actor.role === UserRole.STAFF || actor.role === UserRole.ADMIN) {
      if (!dto.sellerId) {
        throw new BadRequestException("sellerId is required when staff creates a listing");
      }
      const sellerUser = await this.prisma.user.findUnique({ where: { id: dto.sellerId } });
      if (!sellerUser || sellerUser.role !== UserRole.SELLER) {
        throw new BadRequestException("sellerId must reference a seller user");
      }
      sellerId = dto.sellerId;
    }
    const status = dto.status ?? ListingStatus.DRAFT;
    if (status !== ListingStatus.DRAFT && status !== ListingStatus.PENDING_REVIEW) {
      throw new BadRequestException("Sellers can only create listings as DRAFT or PENDING_REVIEW");
    }
    const listing = await this.prisma.listing.create({
      data: {
        sellerId,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        price: dto.price,
        currency: dto.currency ?? "NGN",
        status,
      },
    });
    if (status === ListingStatus.PENDING_REVIEW) {
      await this.ensureVerificationSteps(listing.id);
    }
    const withSeller = await this.prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      include: { seller: { select: { firstName: true, lastName: true } } },
    });
    return this.serializeListing(withSeller, withSeller.seller);
  }

  async findAll(query: ListListingsQueryDto, actor: JwtPayload | null) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ListingWhereInput = {};

    if (!actor) {
      where.status = ListingStatus.LIVE;
    } else if (actor.role === UserRole.SELLER) {
      where.sellerId = actor.sub;
      if (query.status) where.status = query.status;
    } else if (this.isStaff(actor.role)) {
      if (query.status) where.status = query.status;
    } else if (actor.role === UserRole.PROFESSIONAL) {
      where.AND = [
        {
          OR: [
            { verificationSteps: { some: { assignedProfessionalId: actor.sub } } },
            { tasks: { some: { assigneeId: actor.sub } } },
          ],
        },
        ...(query.status ? [{ status: query.status }] : []),
      ];
    } else if (actor.role === UserRole.BUYER) {
      where.status = ListingStatus.LIVE;
    } else {
      where.OR = [{ status: ListingStatus.LIVE }, { sellerId: actor.sub }];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
        include: { seller: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    return {
      data: rows.map((l) => this.serializeListing(l, l.seller)),
      meta: { page, pageSize, total },
    };
  }

  async findOne(id: string, actor: JwtPayload | null) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { seller: { select: { firstName: true, lastName: true } } },
    });
    if (!listing) throw new NotFoundException("Listing not found");
    if (!(await this.canAccessListing(listing, actor))) throw new ForbiddenException();
    return this.serializeListing(listing, listing.seller);
  }

  async update(id: string, dto: UpdateListingDto, actor: JwtPayload) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (!this.canMutate(listing, actor, dto)) throw new ForbiddenException();

    const prevStatus = listing.status;
    const nextStatus = dto.status ?? prevStatus;
    this.assertStatusTransition(prevStatus, nextStatus, actor.role);

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.rejectionReason !== undefined ? { rejectionReason: dto.rejectionReason } : {}),
        ...(nextStatus === ListingStatus.VERIFIED && !listing.verifiedAt
          ? { verifiedAt: new Date() }
          : {}),
      },
    });

    if (
      prevStatus !== ListingStatus.PENDING_REVIEW &&
      nextStatus === ListingStatus.PENDING_REVIEW
    ) {
      await this.ensureVerificationSteps(id);
    }

    const out = await this.prisma.listing.findUniqueOrThrow({
      where: { id },
      include: { seller: { select: { firstName: true, lastName: true } } },
    });
    return this.serializeListing(out, out.seller);
  }

  async remove(id: string, actor: JwtPayload) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.sellerId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }
    const updated = await this.prisma.listing.update({
      where: { id },
      data: { status: ListingStatus.ARCHIVED },
      include: { seller: { select: { firstName: true, lastName: true } } },
    });
    return this.serializeListing(updated, updated.seller);
  }

  private async canAccessListing(
    listing: { id: string; sellerId: string; status: ListingStatus },
    actor: JwtPayload | null,
  ): Promise<boolean> {
    if (listing.status === ListingStatus.LIVE) return true;
    if (!actor) return false;
    if (listing.sellerId === actor.sub) return true;
    if (this.isStaff(actor.role)) return true;
    if (actor.role === UserRole.PROFESSIONAL) {
      const [v, t] = await Promise.all([
        this.prisma.verificationStep.count({
          where: { listingId: listing.id, assignedProfessionalId: actor.sub },
        }),
        this.prisma.task.count({ where: { listingId: listing.id, assigneeId: actor.sub } }),
      ]);
      return v + t > 0;
    }
    return false;
  }

  private canMutate(
    listing: { sellerId: string; status: ListingStatus },
    actor: JwtPayload,
    dto: UpdateListingDto,
  ) {
    if (this.isStaff(actor.role)) return true;
    if (listing.sellerId !== actor.sub) return false;
    if (dto.status && !this.sellerAllowedStatus(dto.status, listing.status)) return false;
    return true;
  }

  private sellerAllowedStatus(next: ListingStatus, current: ListingStatus) {
    const sellerPaths: Partial<Record<ListingStatus, ListingStatus[]>> = {
      [ListingStatus.DRAFT]: [ListingStatus.PENDING_REVIEW, ListingStatus.ARCHIVED],
      [ListingStatus.PENDING_REVIEW]: [ListingStatus.DRAFT, ListingStatus.ARCHIVED],
      [ListingStatus.REJECTED]: [ListingStatus.DRAFT, ListingStatus.PENDING_REVIEW],
    };
    const allowed = sellerPaths[current];
    return allowed?.includes(next) ?? false;
  }

  private assertStatusTransition(
    from: ListingStatus,
    to: ListingStatus,
    role: UserRole,
  ) {
    if (from === to) return;
    if (this.isStaff(role)) {
      return;
    }
    if (!this.sellerAllowedStatus(to, from)) {
      throw new BadRequestException(`Cannot change status from ${from} to ${to}`);
    }
  }

  private async ensureVerificationSteps(listingId: string) {
    const existing = await this.prisma.verificationStep.count({ where: { listingId } });
    if (existing > 0) return;
    await this.prisma.verificationStep.createMany({
      data: VERIFICATION_TEMPLATE.map((t) => ({
        listingId,
        type: t.type,
        order: t.order,
        status:
          t.order === 0 ? VerificationStepStatus.COMPLETED : VerificationStepStatus.PENDING,
        completedAt: t.order === 0 ? new Date() : null,
      })),
    });
  }
}
