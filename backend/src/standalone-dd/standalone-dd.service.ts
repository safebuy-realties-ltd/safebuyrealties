import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ListingStatus,
  PaymentIntent,
  PaymentStatus,
  Prisma,
  TransactionStatus,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformConfigService } from "../platform-config/platform-config.service";
import { PaystackService } from "../payments/paystack.service";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  NotificationEntityType,
  NotificationType,
} from "../notifications/notification-types.constants";
import { SbrIdService } from "../sbr-id/sbr-id.service";
import { StorageService } from "../storage/storage.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { isInternalRole } from "../common/user-roles";
import { CreateStandaloneDdOrderDto } from "./dto/create-standalone-dd-order.dto";
import { InitiateStandaloneDdPaymentDto } from "./dto/initiate-standalone-dd-payment.dto";
import { ListStandaloneDdOrdersQueryDto } from "./dto/list-standalone-dd-orders.query";
import { UpdateStandaloneDdOrderDto } from "./dto/update-standalone-dd-order.dto";
import { AssignStandaloneDdDto } from "./dto/assign-standalone-dd.dto";
import { type DdChecklistSelections, type DdScheduleCode } from "./dd-schedule-checklists";
import { DdCmsService } from "../dd-cms/dd-cms.service";
import { DdCoreService } from "../dd-core/dd-core.service";
import { DdCaseSerializer } from "../dd-core/dd-case.serializer";

const REQUEST_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  SUBMITTED: "SUBMITTED",
  PAID: "PAID",
} as const;

const ORDER_STATUS = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  PAID: "PAID",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
  CANCELLED: "CANCELLED",
} as const;

type StandaloneServiceRequest = Prisma.ServiceRequestGetPayload<{
  include: {
    listing: {
      select: {
        id: true;
        title: true;
        location: true;
        propertyId: true;
        currency: true;
        sellerId: true;
        status: true;
        isPublished: true;
      };
    };
    externalProperty: true;
    transaction: {
      include: {
        payments: {
          orderBy: { createdAt: "desc" };
          take: 1;
        };
        dueDiligenceOrder: {
          include: {
            assignments: {
              include: {
                professional: {
                  select: {
                    id: true;
                    email: true;
                    firstName: true;
                    lastName: true;
                    professionalType: true;
                  };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

@Injectable()
export class StandaloneDdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
    private readonly paystack: PaystackService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly sbrId: SbrIdService,
    private readonly storage: StorageService,
    private readonly ddCms: DdCmsService,
    private readonly ddCore: DdCoreService,
    private readonly caseSerializer: DdCaseSerializer,
  ) {}

  private isListingPubliclyVisible(listing: {
    status: ListingStatus;
    isPublished: boolean;
  }): boolean {
    if (listing.status === ListingStatus.LIVE) return true;
    return listing.status === ListingStatus.VERIFIED && listing.isPublished;
  }

  private assertBuyerActor(actor?: JwtPayload | null) {
    if (!actor) return;
    if (actor.role !== UserRole.BUYER) {
      throw new ForbiddenException("Only buyers can create authenticated due diligence orders");
    }
  }

  private assertStaffActor(actor: JwtPayload) {
    if (!isInternalRole(actor.role)) {
      throw new ForbiddenException("Only staff and admins can manage due diligence cases");
    }
  }

  private splitGuestName(name: string): { firstName: string; lastName: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: "Guest", lastName: "Buyer" };
    if (parts.length === 1) return { firstName: parts[0], lastName: "Buyer" };
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  private activationBaseUrl(): string {
    const raw = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:8080";
    return raw.split(",")[0]?.trim() || "http://localhost:8080";
  }

  private resolveLocationText(order: {
    listingId?: string | null;
    listing?: { location: string } | null;
    externalProperty?: { state: string; lga: string | null; address: string } | null;
  }): string {
    if (order.listingId && order.listing?.location) {
      return order.listing.location;
    }
    const external = order.externalProperty;
    if (!external) return "Lagos";
    return [external.lga, external.state].filter(Boolean).join(", ") || external.state || "Lagos";
  }

  private async resolveCatalogItems(itemIds: string[]) {
    const byId = await this.prisma.serviceCatalogItem.findMany({
      where: { id: { in: itemIds }, active: true },
    });
    const foundIds = new Set(byId.map((item) => item.id));
    const unresolved = itemIds.filter((id) => !foundIds.has(id));
    const byCode =
      unresolved.length > 0
        ? await this.prisma.serviceCatalogItem.findMany({
            where: { code: { in: unresolved }, active: true },
          })
        : [];
    const items = [...byId, ...byCode];
    if (items.length !== itemIds.length) {
      throw new BadRequestException("One or more service item IDs or codes not found");
    }
    return items;
  }

  private async resolveScheduleCatalogItems(scheduleCodes: string[]) {
    const items = await this.prisma.serviceCatalogItem.findMany({
      where: { code: { in: scheduleCodes }, active: true },
    });
    if (items.length !== scheduleCodes.length) {
      const found = new Set(items.map((item) => item.code));
      const missing = scheduleCodes.filter((code) => !found.has(code));
      throw new BadRequestException(`Unknown or inactive schedule(s): ${missing.join(", ")}`);
    }
    return items;
  }

  private async findOrCreateGuestBuyer(email: string, name: string, phone: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      if (existing.role !== UserRole.BUYER) {
        throw new BadRequestException("Email is registered with a different account type");
      }
      return existing;
    }

    const { firstName, lastName } = this.splitGuestName(name);
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    return this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName,
        lastName,
        phone: phone || null,
        role: UserRole.BUYER,
        isActive: false,
      },
    });
  }

  private async ensureBuyerPublicId(buyerId: string, location: string) {
    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerId },
      select: { publicId: true },
    });
    if (buyer?.publicId) return buyer.publicId;
    const publicId = await this.sbrId.nextBuyerId(location);
    await this.prisma.user.update({
      where: { id: buyerId },
      data: { publicId },
    });
    return publicId;
  }

  private async serializeServiceRequest(order: StandaloneServiceRequest) {
    const latestPayment = order.transaction?.payments?.[0] ?? null;
    let ddOrder = order.transaction?.dueDiligenceOrder ?? null;
    if (!ddOrder) {
      ddOrder = await this.prisma.dueDiligenceOrder.findUnique({
        where: { serviceId: order.serviceId },
        include: {
          assignments: {
            include: {
              professional: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  professionalType: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }
    const reportKeys =
      Array.isArray(ddOrder?.reportStorageKeys) && ddOrder?.reportStorageKeys.length > 0
        ? (ddOrder.reportStorageKeys as string[])
        : [];
    const reports = await Promise.all(
      reportKeys.map(async (key) => ({
        key,
        url: await this.storage.getSignedUrl(key),
      })),
    );
    const property = this.caseSerializer.buildPropertySummary({
      listing: order.listing,
      externalProperty: order.externalProperty,
    });
    const services = await this.caseSerializer.resolveServiceLabels(order.bundleId, order.itemIds);
    const assignments = await Promise.all(
      (ddOrder?.assignments ?? []).map((assignment) =>
        this.caseSerializer.serializeAssignment(assignment),
      ),
    );
    const checklistSelections = await this.caseSerializer.parseChecklistSelections(
      (ddOrder?.checklistSelections as Prisma.JsonValue | undefined) ??
        (order as { checklistSelections?: Prisma.JsonValue }).checklistSelections ??
        {},
    );
    const checklistSummary = await this.caseSerializer.buildChecklistSummary(checklistSelections);
    const scheduleCodes = Object.keys(checklistSelections);
    const suggestedProfessionals =
      await this.caseSerializer.buildSuggestedProfessionals(scheduleCodes);

    return {
      id: ddOrder?.id ?? order.id,
      serviceRequestId: order.id,
      serviceId: order.serviceId,
      caseId: order.caseId,
      source: order.source,
      status: ddOrder?.status ?? order.status,
      requestStatus: order.status,
      fulfillmentStatus: ddOrder?.status ?? null,
      guestName: order.guestName,
      guestEmail: order.guestEmail,
      guestPhone: order.guestPhone,
      buyerId: order.buyerId ?? ddOrder?.buyerId ?? null,
      bundleId: order.bundleId,
      itemIds: order.itemIds,
      checklistSelections,
      checklistSummary,
      services,
      suggestedProfessionals,
      subtotal: order.subtotal.toFixed(2),
      vatAmount: order.vatAmount.toFixed(2),
      total: order.total.toFixed(2),
      pricingNote:
        "Quote pending — SafeBuyRealties will confirm pricing based on your selected checks.",
      currency: order.listing?.currency ?? "NGN",
      listingId: order.listingId,
      externalPropertyId: order.externalPropertyId,
      transactionId: order.transactionId,
      transactionStatus: order.transaction?.status ?? null,
      paymentId: latestPayment?.id ?? null,
      paymentStatus: latestPayment?.status ?? null,
      paymentReference: latestPayment?.providerReference ?? null,
      transactionPublicId: latestPayment?.transactionPublicId ?? null,
      verdict: ddOrder?.verdict ?? null,
      staffNotes: ddOrder?.staffNotes ?? null,
      completedAt: ddOrder?.completedAt?.toISOString() ?? null,
      reportStorageKeys: reportKeys,
      reports,
      assignments,
      property,
      listing: order.listing,
      externalProperty: order.externalProperty,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private orderInclude() {
    return {
      listing: {
        select: {
          id: true,
          title: true,
          location: true,
          propertyId: true,
          currency: true,
          sellerId: true,
          status: true,
          isPublished: true,
        },
      },
      externalProperty: true,
      transaction: {
        include: {
          payments: {
            orderBy: { createdAt: "desc" as const },
            take: 1,
          },
          dueDiligenceOrder: {
            include: {
              assignments: {
                include: {
                  professional: {
                    select: {
                      id: true,
                      email: true,
                      firstName: true,
                      lastName: true,
                      professionalType: true,
                    },
                  },
                },
                orderBy: { createdAt: "asc" as const },
              },
            },
          },
        },
      },
    };
  }

  async createOrder(dto: CreateStandaloneDdOrderDto, actor?: JwtPayload | null) {
    this.assertBuyerActor(actor);
    const hasListing = Boolean(dto.listingId);
    const hasExternalProperty = Boolean(dto.externalProperty);
    if (hasListing === hasExternalProperty) {
      throw new BadRequestException("Provide exactly one of listingId or externalProperty");
    }

    const checklistSelections = await this.caseSerializer.normalizeChecklistSelections(
      dto.checklistSelections,
    );
    const validation = await this.ddCms.validateChecklistSelections(checklistSelections);
    if (!validation.ok) {
      throw new BadRequestException(validation.message);
    }
    const scheduleCodes = validation.scheduleCodes;
    const catalogItems = await this.resolveScheduleCatalogItems(scheduleCodes);
    const storedItemIds = catalogItems.map((item) => item.id);

    let listing: StandaloneServiceRequest["listing"] | null = null;
    let externalPropertyId: string | null = null;

    if (dto.listingId) {
      const resolved = await this.prisma.listing.findUnique({
        where: { id: dto.listingId },
        select: {
          id: true,
          title: true,
          location: true,
          propertyId: true,
          currency: true,
          sellerId: true,
          status: true,
          isPublished: true,
        },
      });
      if (!resolved) throw new NotFoundException("Listing not found");
      if (!this.isListingPubliclyVisible(resolved)) {
        throw new BadRequestException("Listing is not available for standalone due diligence");
      }
      listing = resolved;
    } else if (dto.externalProperty) {
      const created = await this.prisma.externalProperty.create({
        data: {
          createdById: actor?.sub ?? null,
          address: dto.externalProperty.address.trim(),
          state: dto.externalProperty.state.trim(),
          lga: dto.externalProperty.lga?.trim() || null,
          propertyType: dto.externalProperty.propertyType?.trim() || null,
          approxSize: dto.externalProperty.approxSize?.trim() || null,
          titleRef: dto.externalProperty.titleRef?.trim() || null,
          sellerName: dto.externalProperty.sellerName?.trim() || null,
          sellerContact: dto.externalProperty.sellerContact?.trim() || null,
          notes: dto.externalProperty.notes?.trim() || null,
        },
      });
      externalPropertyId = created.id;
    }

    const zero = new Prisma.Decimal(0);
    const serviceId = await this.sbrId.nextServiceId();
    const locationHint =
      listing?.location ??
      [dto.externalProperty?.lga, dto.externalProperty?.state].filter(Boolean).join(", ") ??
      "Lagos";
    const caseId = await this.sbrId.nextCaseId(locationHint);

    const buyer = actor?.sub
      ? await this.prisma.user.findUnique({ where: { id: actor.sub } })
      : await this.findOrCreateGuestBuyer(
          dto.guestEmail.trim().toLowerCase(),
          dto.guestName.trim(),
          dto.guestPhone.trim(),
        );
    if (!buyer) {
      throw new NotFoundException("Buyer account could not be resolved");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const serviceRequest = await tx.serviceRequest.create({
        data: {
          serviceId,
          caseId,
          listingId: listing?.id ?? null,
          externalPropertyId,
          buyerId: buyer.id,
          guestName: dto.guestName.trim(),
          guestEmail: dto.guestEmail.trim().toLowerCase(),
          guestPhone: dto.guestPhone.trim(),
          bundleId: null,
          itemIds: storedItemIds as Prisma.InputJsonValue,
          checklistSelections: checklistSelections as Prisma.InputJsonValue,
          subtotal: zero,
          vatAmount: zero,
          total: zero,
          source: "STANDALONE",
          status: REQUEST_STATUS.SUBMITTED,
        },
      });

      await tx.dueDiligenceOrder.create({
        data: {
          buyerId: buyer.id,
          listingId: listing?.id ?? null,
          externalPropertyId,
          serviceId,
          caseId,
          source: "STANDALONE",
          bundleId: null,
          itemIds: storedItemIds as Prisma.InputJsonValue,
          checklistSelections: checklistSelections as Prisma.InputJsonValue,
          subtotal: zero,
          vatAmount: zero,
          total: zero,
          status: ORDER_STATUS.SUBMITTED,
        },
      });

      return tx.serviceRequest.findUniqueOrThrow({
        where: { id: serviceRequest.id },
        include: this.orderInclude(),
      });
    });

    const property = this.caseSerializer.buildPropertySummary({
      listing: created.listing,
      externalProperty: created.externalProperty,
    });
    const services = await this.caseSerializer.resolveServiceLabels(null, storedItemIds);
    const propertyTitle = property?.title ?? "Standalone due diligence";
    const propertyLocation = property?.location ?? locationHint;

    void this.notifications.create({
      userId: buyer.id,
      type: NotificationType.DD_PAYMENT_SUCCEEDED,
      title: "Due diligence request submitted",
      body: `Your due diligence request for "${propertyTitle}" was received. Our team will confirm pricing and next steps.`,
      entityId: serviceId,
      entityType: NotificationEntityType.DueDiligenceOrder,
    });
    void this.notifications.createForStaff({
      type: NotificationType.DD_PAYMENT_SUCCEEDED,
      title: "New due diligence request",
      body: `${dto.guestName.trim()} submitted a standalone due diligence request for "${propertyTitle}" (${serviceId}).`,
      entityId: serviceId,
      entityType: NotificationEntityType.DueDiligenceOrder,
    });
    void this.email.sendStaffDdAlert({
      serviceId,
      caseId,
      guestName: dto.guestName.trim(),
      guestEmail: dto.guestEmail.trim().toLowerCase(),
      guestPhone: dto.guestPhone.trim(),
      propertyTitle,
      propertyLocation,
      services,
      total: "0.00",
      currency: listing?.currency ?? "NGN",
    });

    return this.serializeServiceRequest(created);
  }

  async getOrder(serviceId: string) {
    const order = await this.prisma.serviceRequest.findUnique({
      where: { serviceId },
      include: this.orderInclude(),
    });
    if (!order) throw new NotFoundException("Order not found");
    return this.serializeServiceRequest(order);
  }

  async listOrders(actor: JwtPayload, query: ListStandaloneDdOrdersQueryDto) {
    const where: Prisma.ServiceRequestWhereInput = {
      source: "STANDALONE",
    };

    if (actor.role === UserRole.BUYER) {
      where.buyerId = actor.sub;
    } else if (!isInternalRole(actor.role)) {
      throw new ForbiddenException("You do not have access to these orders");
    }

    if (query.status) {
      where.OR = [
        { status: query.status },
        { transaction: { is: { dueDiligenceOrder: { is: { status: query.status } } } } },
      ];
    }

    const rows = await this.prisma.serviceRequest.findMany({
      where,
      include: this.orderInclude(),
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return Promise.all(rows.map((row) => this.serializeServiceRequest(row)));
  }

  async initiatePayment(serviceId: string, dto: InitiateStandaloneDdPaymentDto) {
    const order = await this.prisma.serviceRequest.findUnique({
      where: { serviceId },
      include: this.orderInclude(),
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== REQUEST_STATUS.PENDING_PAYMENT) {
      throw new BadRequestException("Order is not awaiting payment");
    }

    const guestName = dto.name?.trim() || order.guestName.trim();
    const guestEmail = dto.email?.trim().toLowerCase() || order.guestEmail.trim().toLowerCase();
    const guestPhone = dto.phone?.trim() || order.guestPhone.trim();
    if (!guestName || !guestEmail || !guestPhone) {
      throw new BadRequestException("Name, email, and phone are required to initiate payment");
    }

    const buyer = order.buyerId
      ? await this.prisma.user.findUnique({ where: { id: order.buyerId } })
      : await this.findOrCreateGuestBuyer(guestEmail, guestName, guestPhone);
    if (!buyer) {
      throw new NotFoundException("Buyer account could not be resolved");
    }

    const { firstName, lastName } = this.splitGuestName(guestName);
    await this.prisma.user.update({
      where: { id: buyer.id },
      data: {
        firstName,
        lastName,
        phone: guestPhone,
      },
    });

    await this.prisma.serviceRequest.update({
      where: { id: order.id },
      data: {
        buyerId: buyer.id,
        guestName,
        guestEmail,
        guestPhone,
      },
    });

    const existingPayment = order.transaction?.payments?.[0];
    if (
      existingPayment &&
      (existingPayment.status === PaymentStatus.PENDING ||
        existingPayment.status === PaymentStatus.PROCESSING)
    ) {
      const metadata = existingPayment.metadata as { authorizationUrl?: string };
      return {
        paymentId: existingPayment.id,
        authorizationUrl: metadata.authorizationUrl ?? null,
        reference: existingPayment.providerReference,
        transactionPublicId: existingPayment.transactionPublicId,
      };
    }

    const itemIds = Array.isArray(order.itemIds) ? (order.itemIds as string[]) : [];
    const transactionPublicId = await this.sbrId.nextTransactionId();

    const { payment } = await this.prisma.$transaction(async (tx) => {
      let transactionId = order.transaction?.id;
      if (!transactionId) {
        const created = await tx.transaction.create({
          data: {
            listingId: order.listingId,
            buyerId: buyer.id,
            caseId: order.caseId,
            source: "STANDALONE",
            status: TransactionStatus.INITIATED,
          },
        });
        transactionId = created.id;
        await tx.serviceRequest.update({
          where: { id: order.id },
          data: { transactionId, buyerId: buyer.id },
        });
      }

      await tx.dueDiligenceOrder.upsert({
        where: { transactionId },
        create: {
          transactionId,
          buyerId: buyer.id,
          listingId: order.listingId,
          externalPropertyId: order.externalPropertyId,
          serviceId: order.serviceId,
          caseId: order.caseId,
          source: "STANDALONE",
          bundleId: order.bundleId,
          itemIds: itemIds as Prisma.InputJsonValue,
          subtotal: order.subtotal,
          vatAmount: order.vatAmount,
          total: order.total,
          status: "PENDING",
        },
        update: {
          buyerId: buyer.id,
          listingId: order.listingId,
          externalPropertyId: order.externalPropertyId,
          serviceId: order.serviceId,
          caseId: order.caseId,
          source: "STANDALONE",
          bundleId: order.bundleId,
          itemIds: itemIds as Prisma.InputJsonValue,
          subtotal: order.subtotal,
          vatAmount: order.vatAmount,
          total: order.total,
          status: "PENDING",
        },
      });

      const payment = await tx.payment.create({
        data: {
          payerId: buyer.id,
          listingId: order.listingId,
          transactionId,
          amount: order.total,
          currency: order.listing?.currency ?? "NGN",
          status: PaymentStatus.PENDING,
          intent: PaymentIntent.DD_SERVICE,
          provider: "paystack",
          transactionPublicId,
          metadata: {
            serviceRequestId: order.id,
            standaloneDd: true,
            callbackUrl: dto.callbackUrl,
            serviceId: order.serviceId,
          } as object,
        },
      });

      await tx.transaction.update({
        where: { id: transactionId },
        data: { status: TransactionStatus.IN_PROGRESS },
      });

      return { payment };
    });

    const amountMinor = Math.round(Number(order.total) * 100);

    if (!this.paystack.isConfigured()) {
      throw new ServiceUnavailableException(
        "Paystack is not configured. Set PAYSTACK_SECRET_KEY (or PAYSTACK_TEST_SECRET_KEY) and ensure PAYSTACK_FORCE_MOCK is false.",
      );
    }

    let initialized;
    try {
      initialized = await this.paystack.initializeTransaction({
        email: this.paystack.customerEmail(guestEmail, buyer.id),
        amountMinor,
        currency: order.listing?.currency ?? "NGN",
        callbackUrl: dto.callbackUrl,
        metadata: { paymentId: payment.id, serviceRequestId: order.id, standaloneDd: true },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Paystack initialize failed";
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, metadata: { error: message } as object },
      });
      if (message.includes("fetch") || message.includes("network")) {
        throw new ServiceUnavailableException(
          "Could not reach the payment provider. Please try again.",
        );
      }
      throw new BadRequestException(message);
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerReference: initialized.reference,
        status: PaymentStatus.PROCESSING,
        metadata: {
          serviceRequestId: order.id,
          standaloneDd: true,
          callbackUrl: dto.callbackUrl,
          authorizationUrl: initialized.authorizationUrl,
          accessCode: initialized.accessCode,
          serviceId: order.serviceId,
        } as object,
      },
    });

    return {
      paymentId: payment.id,
      authorizationUrl: initialized.authorizationUrl,
      accessCode: initialized.accessCode,
      reference: initialized.reference,
      transactionPublicId,
    };
  }

  /**
   * No transition table in front of `applyStatusChange`, unlike the listing path.
   *
   * A standalone case is driven by a staff member reading an inbox, and the order the work arrives in
   * is not the order the states were designed in. Imposing the listing table here would start
   * rejecting moves that operations have been making since the path shipped, which is a behaviour
   * change dressed up as a refactor. `STANDALONE_DD_TRANSITIONS` is null for exactly that reason.
   */
  async updateOrder(id: string, dto: UpdateStandaloneDdOrderDto, actor: JwtPayload) {
    this.assertStaffActor(actor);
    const existing = await this.ddCore.findOrderOrThrow(id);
    if (dto.status === "COMPLETE") {
      this.ddCore.assertVerdictOnCompletion(existing.verdict, dto.verdict);
    }

    await this.ddCore.applyStatusChange(existing, dto);

    if (dto.status === "COMPLETE") {
      void this.notifications.create({
        userId: existing.buyerId,
        type: NotificationType.DD_PAYMENT_SUCCEEDED,
        title: "Due diligence report ready",
        body: `Your due diligence case ${existing.serviceId ?? existing.caseId ?? existing.id} is complete. Look it up with your Service ID.`,
        entityId: existing.serviceId ?? existing.id,
        entityType: NotificationEntityType.DueDiligenceOrder,
      });
    }

    return this.caseSerializer.serializeOrder(await this.ddCore.reloadOrder(id));
  }

  async uploadReport(id: string, file: Express.Multer.File, actor: JwtPayload) {
    this.assertStaffActor(actor);
    if (!file) {
      throw new BadRequestException("Report file is required");
    }

    const existing = await this.ddCore.findOrderOrThrow(id);
    await this.ddCore.attachOrderReport(existing, file);
    return this.caseSerializer.serializeOrder(await this.ddCore.reloadOrder(id));
  }

  async listAssignableProfessionals(actor: JwtPayload, scheduleCode?: string) {
    this.assertStaffActor(actor);
    return this.ddCore.listAssignableProfessionals(scheduleCode);
  }

  /**
   * The rejection stays a 400, and the message it carries gets better.
   *
   * `resolveAssignableProfessional` applies the same gate this method always applied and returns a
   * reason that names the missing credential rather than "Professional must be verified before
   * assignment", which told an operations officer nothing they could act on. Nothing that used to be
   * accepted is now refused and nothing that used to be refused is now accepted.
   */
  async assignProfessional(orderId: string, dto: AssignStandaloneDdDto, actor: JwtPayload) {
    this.assertStaffActor(actor);
    const order = await this.ddCore.findOrderOrThrow(orderId);
    if (order.status === ORDER_STATUS.PENDING || order.status === ORDER_STATUS.CANCELLED) {
      throw new BadRequestException("Only submitted or paid due diligence cases can be assigned");
    }

    const resolution = await this.ddCore.resolveAssignableProfessional(dto.professionalId);
    if (!resolution.ok) {
      throw new BadRequestException(resolution.reason);
    }

    const assignment = await this.ddCore.createAssignment(order, resolution.professional.id, dto);

    void this.notifications.create({
      userId: resolution.professional.id,
      type: NotificationType.TASK_ASSIGNED,
      title: "Due diligence assignment",
      body: assignment.title,
      entityId: assignment.id,
      entityType: NotificationEntityType.Task,
    });

    return this.caseSerializer.serializeOrder(
      await this.ddCore.reloadOrder(order.id, "after assign"),
    );
  }

  async listMyAssignments(actor: JwtPayload) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException("Only professionals have due diligence assignments");
    }
    return this.ddCore.listAssignmentsForProfessional(actor.sub);
  }

  /**
   * Staff can file a report against somebody else's assignment here, and on the listing path they
   * cannot. That is not an oversight in either place. A standalone case is often worked by a
   * professional who emails a PDF to the office, and somebody has to put it on the case. A listing
   * case is worked in the product, so a report arriving from anyone but the assignee is a mistake.
   */
  async uploadAssignmentReport(assignmentId: string, file: Express.Multer.File, actor: JwtPayload) {
    if (!file) throw new BadRequestException("Report file is required");
    const assignment = await this.ddCore.findAssignment(assignmentId);
    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.professionalId !== actor.sub && !isInternalRole(actor.role)) {
      throw new ForbiddenException();
    }

    const order = assignment.dueDiligenceOrder;
    await this.ddCore.attachAssignmentReport(order, assignment, file);

    void this.notifications.createForStaff({
      type: NotificationType.TASK_ASSIGNED,
      title: "DD report submitted",
      body: `${assignment.title} report uploaded for ${order.serviceId ?? order.id}.`,
      entityId: order.serviceId ?? order.id,
      entityType: NotificationEntityType.DueDiligenceOrder,
    });

    return this.caseSerializer.serializeOrder(
      await this.ddCore.reloadOrder(order.id, "after report"),
    );
  }

  async completePayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        transaction: {
          include: {
            listing: true,
            serviceRequest: {
              include: {
                listing: {
                  select: {
                    id: true,
                    title: true,
                    location: true,
                    propertyId: true,
                    currency: true,
                    sellerId: true,
                    status: true,
                    isPublished: true,
                  },
                },
                externalProperty: true,
                transaction: {
                  include: {
                    payments: {
                      orderBy: { createdAt: "desc" },
                      take: 1,
                    },
                    dueDiligenceOrder: true,
                  },
                },
              },
            },
            dueDiligenceOrder: true,
          },
        },
      },
    });
    if (!payment) return;

    const metadata = payment.metadata as { serviceRequestId?: string; standaloneDd?: boolean };
    if (!metadata.standaloneDd && !metadata.serviceRequestId) return;

    const serviceRequest =
      payment.transaction?.serviceRequest ??
      (metadata.serviceRequestId
        ? await this.prisma.serviceRequest.findUnique({
            where: { id: metadata.serviceRequestId },
            include: this.orderInclude(),
          })
        : null);
    if (!serviceRequest) return;

    const location = this.resolveLocationText({
      listingId: serviceRequest.listingId,
      listing: serviceRequest.listing,
      externalProperty: serviceRequest.externalProperty,
    });
    const buyerPublicId = await this.ensureBuyerPublicId(payment.payerId, location);
    const buyer = await this.prisma.user.findUnique({
      where: { id: payment.payerId },
      select: { id: true, email: true, isActive: true },
    });
    if (!buyer) return;

    let activationLink: string | null = null;
    if (!buyer.isActive) {
      const activationToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.prisma.accountActivationToken.create({
        data: {
          userId: buyer.id,
          token: activationToken,
          expiresAt,
        },
      });
      activationLink = `${this.activationBaseUrl()}/activate/${activationToken}`;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.SUCCEEDED },
      });

      if (payment.transactionId) {
        await tx.transaction.updateMany({
          where: {
            id: payment.transactionId,
            status: { in: [TransactionStatus.INITIATED, TransactionStatus.IN_PROGRESS] },
          },
          data: { status: TransactionStatus.DD_PURCHASED },
        });
      }

      await tx.serviceRequest.update({
        where: { id: serviceRequest.id },
        data: {
          status: REQUEST_STATUS.PAID,
          buyerId: buyer.id,
        },
      });

      if (payment.transactionId) {
        await tx.dueDiligenceOrder.upsert({
          where: { transactionId: payment.transactionId },
          create: {
            transactionId: payment.transactionId,
            buyerId: buyer.id,
            listingId: serviceRequest.listingId,
            externalPropertyId: serviceRequest.externalPropertyId,
            serviceId: serviceRequest.serviceId,
            caseId: serviceRequest.caseId,
            source: "STANDALONE",
            bundleId: serviceRequest.bundleId,
            itemIds: serviceRequest.itemIds as Prisma.InputJsonValue,
            checklistSelections: (serviceRequest as { checklistSelections?: Prisma.JsonValue })
              .checklistSelections as Prisma.InputJsonValue,
            subtotal: serviceRequest.subtotal,
            vatAmount: serviceRequest.vatAmount,
            total: serviceRequest.total,
            status: "PAID",
          },
          update: {
            buyerId: buyer.id,
            listingId: serviceRequest.listingId,
            externalPropertyId: serviceRequest.externalPropertyId,
            serviceId: serviceRequest.serviceId,
            caseId: serviceRequest.caseId,
            source: "STANDALONE",
            bundleId: serviceRequest.bundleId,
            itemIds: serviceRequest.itemIds as Prisma.InputJsonValue,
            checklistSelections: (serviceRequest as { checklistSelections?: Prisma.JsonValue })
              .checklistSelections as Prisma.InputJsonValue,
            subtotal: serviceRequest.subtotal,
            vatAmount: serviceRequest.vatAmount,
            total: serviceRequest.total,
            status: "PAID",
          },
        });
      }
    });

    const services = await this.caseSerializer.resolveServiceLabels(
      serviceRequest.bundleId,
      serviceRequest.itemIds,
    );
    const property = this.caseSerializer.buildPropertySummary({
      listing: serviceRequest.listing,
      externalProperty: serviceRequest.externalProperty,
    });
    const propertyTitle = property?.title ?? "Standalone due diligence";
    const propertyLocation = property?.location ?? location;

    // Always email the guest a confirmation receipt (logged when SMTP is unset).
    void this.email.sendPaymentReceipt(buyer.email, {
      serviceId: serviceRequest.serviceId,
      transactionPublicId: payment.transactionPublicId ?? payment.id,
      caseId: serviceRequest.caseId,
      buyerPublicId,
      propertyTitle,
      propertyLocation,
      services,
      subtotal: serviceRequest.subtotal.toFixed(2),
      vatAmount: serviceRequest.vatAmount.toFixed(2),
      total: serviceRequest.total.toFixed(2),
      currency: payment.currency,
      activationLink,
      guestName: serviceRequest.guestName,
      guestEmail: serviceRequest.guestEmail,
      guestPhone: serviceRequest.guestPhone,
    });

    void this.notifications.create({
      userId: buyer.id,
      type: NotificationType.DD_PAYMENT_SUCCEEDED,
      title: "Due diligence payment received",
      body: `Your standalone due diligence payment for "${propertyTitle}" was successful.`,
      entityId: serviceRequest.serviceId,
      entityType: NotificationEntityType.DueDiligenceOrder,
    });
    void this.notifications.createForStaff({
      type: NotificationType.DD_PAYMENT_SUCCEEDED,
      title: "Standalone due diligence payment received",
      body: `${serviceRequest.guestName} paid for standalone due diligence on "${propertyTitle}" (${serviceRequest.serviceId}).`,
      entityId: serviceRequest.serviceId,
      entityType: NotificationEntityType.DueDiligenceOrder,
    });
    void this.email.sendStaffDdAlert({
      serviceId: serviceRequest.serviceId,
      caseId: serviceRequest.caseId,
      guestName: serviceRequest.guestName,
      guestEmail: serviceRequest.guestEmail,
      guestPhone: serviceRequest.guestPhone,
      propertyTitle,
      propertyLocation,
      services,
      total: serviceRequest.total.toFixed(2),
      currency: payment.currency,
    });
  }

  /**
   * Public callback helper: confirm Paystack charge (or mock) for a guest order
   * after redirect without requiring JWT.
   */
  async verifyPayment(serviceId: string, reference?: string) {
    const order = await this.prisma.serviceRequest.findUnique({
      where: { serviceId },
      include: this.orderInclude(),
    });
    if (!order) throw new NotFoundException("Order not found");

    const latestPayment = order.transaction?.payments?.[0] ?? null;
    if (!latestPayment) {
      throw new BadRequestException("No payment found for this order");
    }

    if (latestPayment.status === PaymentStatus.SUCCEEDED || order.status === REQUEST_STATUS.PAID) {
      return this.getOrder(serviceId);
    }

    const ref = (reference ?? latestPayment.providerReference)?.trim();
    if (!ref) {
      throw new BadRequestException("Payment has no provider reference to verify");
    }

    if (ref.startsWith("mock_")) {
      await this.completePayment(latestPayment.id);
      return this.getOrder(serviceId);
    }

    if (!this.paystack.isConfigured()) {
      throw new ServiceUnavailableException("Payment gateway is not configured");
    }

    let paystackStatus: string | undefined;
    try {
      paystackStatus = await this.paystack.verifyTransaction(ref);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Paystack verify failed";
      throw new BadRequestException(message);
    }

    if (paystackStatus !== "success") {
      throw new BadRequestException(
        `Payment not successful (status: ${paystackStatus ?? "unknown"})`,
      );
    }

    await this.prisma.payment.update({
      where: { id: latestPayment.id },
      data: { providerReference: ref },
    });
    await this.completePayment(latestPayment.id);
    return this.getOrder(serviceId);
  }
}
