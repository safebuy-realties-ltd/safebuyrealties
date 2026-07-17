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

const REQUEST_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PAID: "PAID",
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
        dueDiligenceOrder: true;
      };
    };
  };
}>;

type DueDiligenceOrderWithRelations = Prisma.DueDiligenceOrderGetPayload<{
  include: {
    listing: {
      select: {
        id: true;
        title: true;
        location: true;
        propertyId: true;
        currency: true;
      };
    };
    externalProperty: true;
    transaction: {
      include: {
        payments: {
          orderBy: { createdAt: "desc" };
          take: 1;
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

  private async calculateTotals(dto: Pick<CreateStandaloneDdOrderDto, "itemIds" | "bundleId">) {
    let subtotal = new Prisma.Decimal(0);
    let resolvedItemIds: string[] = [];

    if (dto.bundleId) {
      const bundle = await this.prisma.serviceBundle.findUnique({
        where: { id: dto.bundleId },
        include: { items: { select: { itemId: true } } },
      });
      if (!bundle || !bundle.active) {
        throw new NotFoundException(`Bundle ${dto.bundleId} not found`);
      }
      subtotal = bundle.basePrice;
      resolvedItemIds = bundle.items.map((item) => item.itemId);
    } else if (dto.itemIds?.length) {
      const items = await this.resolveCatalogItems(dto.itemIds);
      resolvedItemIds = items.map((item) => item.id);
      for (const item of items) {
        subtotal = subtotal.add(item.basePrice);
      }
    } else {
      throw new BadRequestException("Provide at least one of itemIds or bundleId");
    }

    const vatRate = await this.platformConfig.getVatRate();
    const vatAmount = subtotal.mul(new Prisma.Decimal(vatRate));
    const total = subtotal.add(vatAmount);

    return { subtotal, vatAmount, total, resolvedItemIds };
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

  private buildPropertySummary(order: {
    listing?: { title: string; location: string; propertyId: string | null } | null;
    externalProperty?: {
      address: string;
      state: string;
      lga: string | null;
      propertyType: string | null;
      titleRef: string | null;
    } | null;
  }) {
    if (order.listing) {
      return {
        kind: "LISTING" as const,
        title: order.listing.title,
        location: order.listing.location,
        propertyId: order.listing.propertyId,
      };
    }

    if (!order.externalProperty) {
      return null;
    }

    const external = order.externalProperty;
    return {
      kind: "EXTERNAL" as const,
      title: external.propertyType
        ? `${external.propertyType} due diligence`
        : "Standalone property due diligence",
      location: [external.address, external.lga, external.state].filter(Boolean).join(", "),
      propertyId: external.titleRef,
    };
  }

  private async serializeServiceRequest(order: StandaloneServiceRequest) {
    const latestPayment = order.transaction?.payments?.[0] ?? null;
    const ddOrder = order.transaction?.dueDiligenceOrder ?? null;
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
    const property = this.buildPropertySummary({
      listing: order.listing,
      externalProperty: order.externalProperty,
    });
    const services = await this.resolveServiceLabels(order.bundleId, order.itemIds);

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
      services,
      subtotal: order.subtotal.toFixed(2),
      vatAmount: order.vatAmount.toFixed(2),
      total: order.total.toFixed(2),
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
      property,
      listing: order.listing,
      externalProperty: order.externalProperty,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private async serializeDueDiligenceOrder(order: DueDiligenceOrderWithRelations) {
    const reportKeys =
      Array.isArray(order.reportStorageKeys) && order.reportStorageKeys.length > 0
        ? (order.reportStorageKeys as string[])
        : [];
    const reports = await Promise.all(
      reportKeys.map(async (key) => ({
        key,
        url: await this.storage.getSignedUrl(key),
      })),
    );
    const property = this.buildPropertySummary({
      listing: order.listing,
      externalProperty: order.externalProperty,
    });
    const services = await this.resolveServiceLabels(order.bundleId, order.itemIds);

    return {
      id: order.id,
      serviceId: order.serviceId,
      caseId: order.caseId,
      source: order.source,
      status: order.status,
      buyerId: order.buyerId,
      bundleId: order.bundleId,
      itemIds: order.itemIds,
      services,
      subtotal: order.subtotal.toFixed(2),
      vatAmount: order.vatAmount.toFixed(2),
      total: order.total.toFixed(2),
      currency: order.listing?.currency ?? "NGN",
      listingId: order.listingId,
      externalPropertyId: order.externalPropertyId,
      transactionId: order.transactionId,
      transactionStatus: order.transaction?.status ?? null,
      verdict: order.verdict,
      staffNotes: order.staffNotes,
      completedAt: order.completedAt?.toISOString() ?? null,
      reportStorageKeys: reportKeys,
      reports,
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
          dueDiligenceOrder: true,
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

    const totals = await this.calculateTotals(dto);
    const serviceId = await this.sbrId.nextServiceId();
    const locationHint =
      listing?.location ??
      [dto.externalProperty?.lga, dto.externalProperty?.state].filter(Boolean).join(", ") ??
      "Lagos";
    const caseId = await this.sbrId.nextCaseId(locationHint);
    const storedItemIds = dto.bundleId ? totals.resolvedItemIds : (dto.itemIds ?? []);

    const created = await this.prisma.serviceRequest.create({
      data: {
        serviceId,
        caseId,
        listingId: listing?.id ?? null,
        externalPropertyId,
        buyerId: actor?.sub ?? null,
        guestName: dto.guestName.trim(),
        guestEmail: dto.guestEmail.trim().toLowerCase(),
        guestPhone: dto.guestPhone.trim(),
        bundleId: dto.bundleId ?? null,
        itemIds: storedItemIds as Prisma.InputJsonValue,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        total: totals.total,
        source: "STANDALONE",
        status: REQUEST_STATUS.PENDING_PAYMENT,
      },
      include: this.orderInclude(),
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
      where.OR = [{ status: query.status }, { transaction: { is: { dueDiligenceOrder: { is: { status: query.status } } } } }];
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
      const mockRef = `mock_standalone_${payment.id}`;
      const callbackSeparator = dto.callbackUrl.includes("?") ? "&" : "?";
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerReference: mockRef },
      });
      await this.completePayment(payment.id);
      return {
        paymentId: payment.id,
        authorizationUrl:
          `${dto.callbackUrl}${callbackSeparator}mock=1&ref=${mockRef}&paymentId=${payment.id}`,
        reference: mockRef,
        transactionPublicId,
      };
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
          serviceId: order.serviceId,
        } as object,
      },
    });

    return {
      paymentId: payment.id,
      authorizationUrl: initialized.authorizationUrl,
      reference: initialized.reference,
      transactionPublicId,
    };
  }

  async updateOrder(id: string, dto: UpdateStandaloneDdOrderDto, actor: JwtPayload) {
    this.assertStaffActor(actor);
    const existing = await this.prisma.dueDiligenceOrder.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            location: true,
            propertyId: true,
            currency: true,
          },
        },
        externalProperty: true,
        transaction: {
          include: {
            payments: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException("Due diligence order not found");
    if (dto.status === "COMPLETE" && !(dto.verdict?.trim() || existing.verdict)) {
      throw new BadRequestException("Verdict is required when completing a due diligence case");
    }

    await this.prisma.dueDiligenceOrder.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.verdict !== undefined ? { verdict: dto.verdict.trim() || null } : {}),
        ...(dto.staffNotes !== undefined ? { staffNotes: dto.staffNotes.trim() || null } : {}),
        ...(dto.status === "COMPLETE" ? { completedAt: new Date() } : {}),
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            location: true,
            propertyId: true,
            currency: true,
          },
        },
        externalProperty: true,
        transaction: {
          include: {
            payments: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (existing.transactionId && dto.status) {
      await this.prisma.transaction.update({
        where: { id: existing.transactionId },
        data: {
          status:
            dto.status === "COMPLETE"
              ? TransactionStatus.DD_COMPLETE
              : TransactionStatus.DD_IN_PROGRESS,
        },
      });
    }

    const refreshed = await this.prisma.dueDiligenceOrder.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            location: true,
            propertyId: true,
            currency: true,
          },
        },
        externalProperty: true,
        transaction: {
          include: {
            payments: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    if (!refreshed) {
      throw new NotFoundException("Due diligence order not found after update");
    }

    return this.serializeDueDiligenceOrder(refreshed);
  }

  async uploadReport(id: string, file: Express.Multer.File, actor: JwtPayload) {
    this.assertStaffActor(actor);
    if (!file) {
      throw new BadRequestException("Report file is required");
    }

    const existing = await this.prisma.dueDiligenceOrder.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            location: true,
            propertyId: true,
            currency: true,
          },
        },
        externalProperty: true,
        transaction: {
          include: {
            payments: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException("Due diligence order not found");

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `due-diligence/${existing.id}/reports/${Date.now()}-${safeName}`;
    await this.storage.upload(file.buffer, storageKey, file.mimetype);

    const currentKeys =
      Array.isArray(existing.reportStorageKeys) && existing.reportStorageKeys.length > 0
        ? (existing.reportStorageKeys as string[])
        : [];
    const updated = await this.prisma.dueDiligenceOrder.update({
      where: { id },
      data: {
        reportStorageKeys: [...currentKeys, storageKey] as Prisma.InputJsonValue,
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            location: true,
            propertyId: true,
            currency: true,
          },
        },
        externalProperty: true,
        transaction: {
          include: {
            payments: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    return this.serializeDueDiligenceOrder(updated);
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
            subtotal: serviceRequest.subtotal,
            vatAmount: serviceRequest.vatAmount,
            total: serviceRequest.total,
            status: "PAID",
          },
        });
      }
    });

    const services = await this.resolveServiceLabels(serviceRequest.bundleId, serviceRequest.itemIds);
    const property = this.buildPropertySummary({
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

    if (
      latestPayment.status === PaymentStatus.SUCCEEDED ||
      order.status === REQUEST_STATUS.PAID
    ) {
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
      throw new BadRequestException(`Payment not successful (status: ${paystackStatus ?? "unknown"})`);
    }

    await this.prisma.payment.update({
      where: { id: latestPayment.id },
      data: { providerReference: ref },
    });
    await this.completePayment(latestPayment.id);
    return this.getOrder(serviceId);
  }

  private async resolveServiceLabels(
    bundleId: string | null,
    itemIds: Prisma.JsonValue,
  ): Promise<string[]> {
    const labels: string[] = [];
    if (bundleId) {
      const bundle = await this.prisma.serviceBundle.findUnique({ where: { id: bundleId } });
      if (bundle) labels.push(bundle.name);
    } else if (Array.isArray(itemIds) && itemIds.length > 0) {
      const items =
        (await this.prisma.serviceCatalogItem.findMany({
          where: { id: { in: itemIds as string[] } },
          select: { name: true },
        })) ?? [];
      labels.push(...items.map((item) => item.name));
    }
    return labels;
  }
}
