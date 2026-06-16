import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  ListingMediaType,
  ListingStatus,
  UserRole,
  Prisma,
  VerificationStepType,
  VerificationStepStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { NotificationsService } from "../notifications/notifications.service";
import {
  NotificationEntityType,
  NotificationType,
} from "../notifications/notification-types.constants";
import { JwtPayload } from "../auth/jwt.strategy";
import { isInternalRole } from "../common/user-roles";
import { SbrIdService } from "../sbr-id/sbr-id.service";
import { CreateListingDto } from "./dto/create-listing.dto";
import { UpdateListingDto } from "./dto/update-listing.dto";
import { ListListingsQueryDto } from "./dto/list-listings.query";
import { isPubliclyVisible, publiclyVisibleWhere } from "./listings-public.helper";

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

const LISTING_STATUS_PIPELINE: ListingStatus[] = [
  ListingStatus.PENDING_REVIEW,
  ListingStatus.ASSIGNED,
  ListingStatus.IN_VERIFICATION,
  ListingStatus.VERIFIED,
  ListingStatus.LIVE,
];

@Injectable()
export class ListingsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private sbrId: SbrIdService,
  ) {}

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
      propertyId?: string | null;
      isPublished?: boolean;
      propertyType?: string | null;
      beds?: number | null;
      baths?: number | null;
      landAreaSqm?: Prisma.Decimal | null;
      buildType?: string | null;
      verifiedAt: Date | null;
      rejectionReason: string | null;
      createdAt: Date;
      updatedAt: Date;
      media?: {
        id: string;
        listingId: string;
        storageKey: string;
        type: ListingMediaType;
        sortOrder: number;
        createdAt: Date;
      }[];
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
      propertyId: l.propertyId ?? null,
      isPublished: l.isPublished ?? false,
      propertyType: l.propertyType ?? null,
      beds: l.beds ?? null,
      baths: l.baths ?? null,
      landAreaSqm: l.landAreaSqm != null ? Number(l.landAreaSqm) : null,
      buildType: l.buildType ?? null,
      verifiedAt: l.verifiedAt?.toISOString() ?? null,
      rejectionReason: l.rejectionReason,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      media: (l.media ?? []).map((m) => ({
        id: m.id,
        listingId: m.listingId,
        storageKey: m.storageKey,
        type: m.type === ListingMediaType.HERO ? "hero" : "gallery",
        sortOrder: m.sortOrder,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  private listingInclude = {
    seller: { select: { firstName: true, lastName: true } },
    media: {
      orderBy: [
        { sortOrder: "asc" as const },
        { createdAt: "asc" as const },
        { id: "asc" as const },
      ],
    },
  } satisfies Prisma.ListingInclude;

  private isStaff(role: UserRole) {
    return isInternalRole(role);
  }

  private buildSearchWhere(query: ListListingsQueryDto): Prisma.ListingWhereInput {
    const conditions: Prisma.ListingWhereInput[] = [];

    const location = query.location?.trim();
    if (location) {
      conditions.push({
        location: { contains: location, mode: "insensitive" },
      });
    }

    if (query.minPrice != null) {
      conditions.push({ price: { gte: query.minPrice } });
    }

    if (query.maxPrice != null) {
      conditions.push({ price: { lte: query.maxPrice } });
    }

    const buildType = query.buildType?.trim();
    if (buildType) {
      conditions.push({
        buildType: { equals: buildType, mode: "insensitive" },
      });
    }

    if (query.minBeds != null) {
      conditions.push({ beds: { gte: query.minBeds } });
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  private buildRoleWhere(
    query: ListListingsQueryDto,
    actor: JwtPayload | null,
  ): Prisma.ListingWhereInput {
    if (!actor) {
      return publiclyVisibleWhere();
    }

    if (actor.role === UserRole.SELLER) {
      const where: Prisma.ListingWhereInput = { sellerId: actor.sub };
      if (query.status) where.status = query.status;
      return where;
    }

    if (this.isStaff(actor.role)) {
      const where: Prisma.ListingWhereInput = {};
      if (query.status) where.status = query.status;
      if (query.sellerId) where.sellerId = query.sellerId;
      return where;
    }

    if (actor.role === UserRole.PROFESSIONAL) {
      return {
        AND: [
          {
            OR: [
              { verificationSteps: { some: { assignedProfessionalId: actor.sub } } },
              { tasks: { some: { assigneeId: actor.sub } } },
            ],
          },
          ...(query.status ? [{ status: query.status }] : []),
        ],
      };
    }

    if (actor.role === UserRole.BUYER) {
      if (query.status) return { status: query.status };
      return publiclyVisibleWhere();
    }

    return {
      OR: [{ status: ListingStatus.LIVE }, { sellerId: actor.sub }],
    };
  }

  private mergeWhere(...parts: Prisma.ListingWhereInput[]): Prisma.ListingWhereInput {
    const active = parts.filter((part) => Object.keys(part).length > 0);
    if (active.length === 0) return {};
    if (active.length === 1) return active[0];
    return { AND: active };
  }

  async create(dto: CreateListingDto, actor: JwtPayload) {
    if (actor.role !== UserRole.SELLER && !isInternalRole(actor.role)) {
      throw new ForbiddenException("Only sellers and staff can create listings");
    }
    let sellerId = actor.sub;
    if (isInternalRole(actor.role) && actor.role !== UserRole.SELLER) {
      if (!dto.sellerId) {
        throw new BadRequestException("sellerId is required when staff creates a listing");
      }
      const sellerUser = await this.prisma.user.findUnique({ where: { id: dto.sellerId } });
      if (!sellerUser || sellerUser.role !== UserRole.SELLER) {
        throw new BadRequestException("sellerId must reference a seller user");
      }
      sellerId = dto.sellerId;
    }
    const isStaffCreator = isInternalRole(actor.role) && actor.role !== UserRole.SELLER;
    let status: ListingStatus = ListingStatus.DRAFT;
    if (isStaffCreator && dto.status) {
      status = dto.status;
    }
    if (status !== ListingStatus.DRAFT && status !== ListingStatus.PENDING_REVIEW) {
      throw new BadRequestException("Listings can only be created as DRAFT or PENDING_REVIEW");
    }

    let propertyId: string | undefined;
    if (status === ListingStatus.PENDING_REVIEW) {
      propertyId = await this.sbrId.nextPropertyId(dto.location);
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
        isPublished: false,
        ...(propertyId ? { propertyId } : {}),
        ...(dto.propertyType !== undefined ? { propertyType: dto.propertyType } : {}),
        ...(dto.beds !== undefined ? { beds: dto.beds } : {}),
        ...(dto.baths !== undefined ? { baths: dto.baths } : {}),
        ...(dto.landAreaSqm !== undefined ? { landAreaSqm: dto.landAreaSqm } : {}),
        ...(dto.buildType !== undefined ? { buildType: dto.buildType } : {}),
      },
    });
    if (status === ListingStatus.PENDING_REVIEW) {
      await this.ensureVerificationSteps(listing.id);
      void this.notifyListingSubmitted(listing.id, listing.title);
    }
    const withSeller = await this.prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      include: this.listingInclude,
    });
    return this.serializeListing(withSeller, withSeller.seller);
  }

  async findAll(query: ListListingsQueryDto, actor: JwtPayload | null) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.mergeWhere(
      this.buildRoleWhere(query, actor),
      this.buildSearchWhere(query),
    );

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
        include: this.listingInclude,
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
      include: this.listingInclude,
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

    let propertyIdUpdate: string | undefined;
    if (
      nextStatus === ListingStatus.PENDING_REVIEW &&
      !listing.propertyId &&
      prevStatus !== ListingStatus.PENDING_REVIEW
    ) {
      propertyIdUpdate = await this.sbrId.nextPropertyId(dto.location ?? listing.location);
    }

    const staffCanSetPublished = this.isStaff(actor.role);
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
        ...(dto.beds !== undefined ? { beds: dto.beds } : {}),
        ...(dto.baths !== undefined ? { baths: dto.baths } : {}),
        ...(dto.landAreaSqm !== undefined ? { landAreaSqm: dto.landAreaSqm } : {}),
        ...(dto.buildType !== undefined ? { buildType: dto.buildType } : {}),
        ...(dto.propertyType !== undefined ? { propertyType: dto.propertyType } : {}),
        ...(propertyIdUpdate ? { propertyId: propertyIdUpdate } : {}),
        ...(nextStatus === ListingStatus.LIVE ? { isPublished: true } : {}),
        ...(staffCanSetPublished && dto.isPublished !== undefined
          ? { isPublished: dto.isPublished }
          : {}),
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
      void this.notifyListingSubmitted(id, updated.title);
    }

    if (dto.status !== undefined && prevStatus !== nextStatus) {
      const action =
        nextStatus === ListingStatus.REJECTED
          ? AuditAction.LISTING_REJECTED
          : AuditAction.LISTING_STATUS_CHANGED;
      void this.audit.log({
        actorId: actor.sub,
        action,
        entity: "Listing",
        entityId: id,
        before: {
          status: prevStatus,
          rejectionReason: listing.rejectionReason,
        },
        after: {
          status: nextStatus,
          rejectionReason: updated.rejectionReason,
        },
      });

      if (nextStatus === ListingStatus.VERIFIED) {
        void this.notifications.create({
          userId: listing.sellerId,
          type: NotificationType.LISTING_VERIFIED,
          title: "Listing verified",
          body: `"${updated.title}" has been verified and can proceed toward going live.`,
          entityId: id,
          entityType: NotificationEntityType.Listing,
        });
      } else if (nextStatus === ListingStatus.REJECTED) {
        const reason = updated.rejectionReason?.trim();
        void this.notifications.create({
          userId: listing.sellerId,
          type: NotificationType.LISTING_REJECTED,
          title: "Listing rejected",
          body: reason
            ? `"${updated.title}" was rejected: ${reason}`
            : `"${updated.title}" was rejected. Review the listing and resubmit when ready.`,
          entityId: id,
          entityType: NotificationEntityType.Listing,
        });
      }

      if (nextStatus === ListingStatus.LIVE || nextStatus === ListingStatus.UNDER_OFFER) {
        void this.notifySavedBuyersOnStatusChange(id, updated.title, nextStatus);
      }
    }

    const out = await this.prisma.listing.findUniqueOrThrow({
      where: { id },
      include: this.listingInclude,
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
      include: this.listingInclude,
    });
    return this.serializeListing(updated, updated.seller);
  }

  async saveListing(listingId: string, actor: JwtPayload) {
    if (actor.role !== UserRole.BUYER) throw new ForbiddenException();
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.status !== ListingStatus.LIVE && listing.status !== ListingStatus.UNDER_OFFER) {
      throw new BadRequestException("Only live or under-offer listings can be saved");
    }

    await this.prisma.savedProperty.upsert({
      where: { buyerId_listingId: { buyerId: actor.sub, listingId } },
      create: { buyerId: actor.sub, listingId },
      update: {},
    });

    return { saved: true, listingId };
  }

  async unsaveListing(listingId: string, actor: JwtPayload) {
    if (actor.role !== UserRole.BUYER) throw new ForbiddenException();
    await this.prisma.savedProperty.deleteMany({
      where: { buyerId: actor.sub, listingId },
    });
    return { saved: false, listingId };
  }

  async findSaved(actor: JwtPayload, page = 1, pageSize = 20) {
    if (actor.role !== UserRole.BUYER) throw new ForbiddenException();
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const [rows, total] = await Promise.all([
      this.prisma.savedProperty.findMany({
        where: { buyerId: actor.sub },
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          listing: { include: this.listingInclude },
        },
      }),
      this.prisma.savedProperty.count({ where: { buyerId: actor.sub } }),
    ]);

    const listings = rows.map((r) => this.serializeListing(r.listing, r.listing.seller));
    const savedIds = rows.map((r) => r.listingId);

    return {
      listings,
      savedIds,
      meta: { page, pageSize: take, total },
    };
  }

  async isListingSaved(listingId: string, buyerId: string): Promise<boolean> {
    const row = await this.prisma.savedProperty.findUnique({
      where: { buyerId_listingId: { buyerId, listingId } },
    });
    return !!row;
  }

  async getListingAnalytics(listingId: string, actor: JwtPayload) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.sellerId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }

    const txIds = await this.prisma.transaction.findMany({
      where: { listingId },
      select: { id: true },
    });
    const transactionIds = txIds.map((t) => t.id);

    const [saves, transactionCount, ddPurchases] = await Promise.all([
      this.prisma.savedProperty.count({ where: { listingId } }),
      this.prisma.transaction.count({ where: { listingId } }),
      transactionIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.dueDiligenceOrder.count({
            where: {
              transactionId: { in: transactionIds },
              status: { in: ["PAID", "IN_PROGRESS", "COMPLETE"] },
            },
          }),
    ]);

    return {
      views: 0,
      saves,
      transactionCount,
      ddPurchases,
    };
  }

  private async notifySavedBuyersOnStatusChange(
    listingId: string,
    title: string,
    status: ListingStatus,
  ) {
    const savers = await this.prisma.savedProperty.findMany({
      where: { listingId },
      select: { buyerId: true },
    });

    const type =
      status === ListingStatus.LIVE
        ? NotificationType.SAVED_LISTING_LIVE
        : NotificationType.SAVED_LISTING_UNDER_OFFER;

    const body =
      status === ListingStatus.LIVE
        ? `"${title}" is now live on the marketplace.`
        : `"${title}" is now under offer.`;

    for (const { buyerId } of savers) {
      void this.notifications.create({
        userId: buyerId,
        type,
        title: status === ListingStatus.LIVE ? "Saved listing is live" : "Saved listing under offer",
        body,
        entityId: listingId,
        entityType: NotificationEntityType.Listing,
      });
    }
  }

  private async canAccessListing(
    listing: { id: string; sellerId: string; status: ListingStatus; isPublished: boolean },
    actor: JwtPayload | null,
  ): Promise<boolean> {
    if (isPubliclyVisible(listing)) return true;
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

  private assertStatusTransition(from: ListingStatus, to: ListingStatus, role: UserRole) {
    if (from === to) return;
    if (this.isStaff(role)) {
      return;
    }
    if (!this.sellerAllowedStatus(to, from)) {
      throw new BadRequestException(`Cannot change status from ${from} to ${to}`);
    }
  }

  private async notifyListingSubmitted(listingId: string, title: string) {
    await this.notifications.createForStaff({
      type: NotificationType.LISTING_SUBMITTED,
      title: "New listing submission",
      body: `"${title}" was submitted and is ready for review.`,
      entityId: listingId,
      entityType: NotificationEntityType.Listing,
    });
  }

  private async ensureVerificationSteps(listingId: string) {
    const existing = await this.prisma.verificationStep.count({ where: { listingId } });
    if (existing > 0) return;
    await this.prisma.verificationStep.createMany({
      data: VERIFICATION_TEMPLATE.map((t) => ({
        listingId,
        type: t.type,
        order: t.order,
        status: t.order === 0 ? VerificationStepStatus.COMPLETED : VerificationStepStatus.PENDING,
        completedAt: t.order === 0 ? new Date() : null,
      })),
    });
  }

  private listingStatusRank(status: ListingStatus): number {
    const rank = LISTING_STATUS_PIPELINE.indexOf(status);
    return rank === -1 ? -1 : rank;
  }

  private isVerificationStepDone(status: VerificationStepStatus): boolean {
    return (
      status === VerificationStepStatus.ACCEPTED || status === VerificationStepStatus.COMPLETED
    );
  }

  resolveListingStatusFromVerificationSteps(
    currentStatus: ListingStatus,
    steps: { status: VerificationStepStatus; order: number }[],
  ): ListingStatus | null {
    if (steps.length === 0) return null;

    if (steps.every((s) => this.isVerificationStepDone(s.status))) {
      return ListingStatus.LIVE;
    }

    const verificationUnderway = steps.some(
      (s) => s.order > 0 && s.status !== VerificationStepStatus.PENDING,
    );
    if (verificationUnderway) {
      return ListingStatus.IN_VERIFICATION;
    }

    if (currentStatus === ListingStatus.PENDING_REVIEW) {
      return ListingStatus.ASSIGNED;
    }

    return null;
  }

  /**
   * Advances listing status based on verification step progress so staff workflow
   * does not require separate Submissions approve clicks.
   */
  async syncListingStatusFromVerification(
    listingId: string,
    actorId: string,
  ): Promise<ListingStatus | null> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return null;

    const frozen: ListingStatus[] = [
      ListingStatus.LIVE,
      ListingStatus.REJECTED,
      ListingStatus.ARCHIVED,
    ];
    if (frozen.includes(listing.status)) return listing.status;

    const steps = await this.prisma.verificationStep.findMany({
      where: { listingId },
      orderBy: { order: "asc" },
    });
    if (steps.length === 0) return listing.status;

    const candidate = this.resolveListingStatusFromVerificationSteps(listing.status, steps);
    if (!candidate || candidate === listing.status) return listing.status;

    const currentRank = this.listingStatusRank(listing.status);
    const candidateRank = this.listingStatusRank(candidate);
    if (currentRank !== -1 && candidateRank !== -1 && candidateRank <= currentRank) {
      return listing.status;
    }

    const prevStatus = listing.status;
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        status: candidate,
        ...(candidate === ListingStatus.LIVE ? { isPublished: true } : {}),
        ...((candidate === ListingStatus.VERIFIED || candidate === ListingStatus.LIVE) &&
        !listing.verifiedAt
          ? { verifiedAt: new Date() }
          : {}),
      },
    });

    void this.audit.log({
      actorId,
      action: AuditAction.LISTING_STATUS_CHANGED,
      entity: "Listing",
      entityId: listingId,
      before: { status: prevStatus },
      after: { status: candidate },
    });

    if (candidate === ListingStatus.VERIFIED || candidate === ListingStatus.LIVE) {
      void this.notifications.create({
        userId: listing.sellerId,
        type: NotificationType.LISTING_VERIFIED,
        title: candidate === ListingStatus.LIVE ? "Listing is live" : "Listing verified",
        body:
          candidate === ListingStatus.LIVE
            ? `"${updated.title}" is now live on the marketplace.`
            : `"${updated.title}" has been verified and can proceed toward going live.`,
        entityId: listingId,
        entityType: NotificationEntityType.Listing,
      });
    }

    if (candidate === ListingStatus.LIVE) {
      void this.notifySavedBuyersOnStatusChange(listingId, updated.title, ListingStatus.LIVE);
    }

    return candidate;
  }
}
