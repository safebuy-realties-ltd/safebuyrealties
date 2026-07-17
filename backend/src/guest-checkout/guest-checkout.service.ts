import {
  Injectable,
  BadRequestException,
  ConflictException,
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
import { CreateGuestOrderDto } from "./dto/create-guest-order.dto";
import { InitiateGuestPaymentDto } from "./dto/initiate-guest-payment.dto";

const GUEST_ORDER_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PAID: "PAID",
} as const;

@Injectable()
export class GuestCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
    private readonly paystack: PaystackService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly sbrId: SbrIdService,
  ) {}

  private isListingPubliclyVisible(listing: {
    status: ListingStatus;
    isPublished: boolean;
  }): boolean {
    if (listing.status === ListingStatus.LIVE) return true;
    return listing.status === ListingStatus.VERIFIED && listing.isPublished;
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

  private async resolveCatalogItems(itemIds: string[]) {
    const byId = await this.prisma.serviceCatalogItem.findMany({
      where: { id: { in: itemIds }, active: true },
    });
    const foundIds = new Set(byId.map((i) => i.id));
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

  private async calculateTotals(
    dto: Pick<CreateGuestOrderDto, "itemIds" | "bundleId" | "includeInspection">,
  ) {
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
      resolvedItemIds = bundle.items.map((i) => i.itemId);
    } else if (dto.itemIds?.length) {
      const items = await this.resolveCatalogItems(dto.itemIds);
      resolvedItemIds = items.map((i) => i.id);
      for (const item of items) {
        subtotal = subtotal.add(item.basePrice);
      }
    } else {
      throw new BadRequestException("Provide at least one of itemIds or bundleId");
    }

    let inspectionFee = new Prisma.Decimal(0);
    if (dto.includeInspection) {
      const config = await this.prisma.platformConfig.upsert({
        where: { id: "singleton" },
        create: { id: "singleton" },
        update: {},
      });
      inspectionFee = config.inspectionFee;
      subtotal = subtotal.add(inspectionFee);
    }

    const vatRate = await this.platformConfig.getVatRate();
    const vatAmount = subtotal.mul(new Prisma.Decimal(vatRate));
    const total = subtotal.add(vatAmount);

    return { subtotal, vatAmount, total, inspectionFee, resolvedItemIds };
  }

  private async findOrCreateGuestBuyer(email: string, name: string, phone: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      if (existing.role !== UserRole.BUYER) {
        throw new ConflictException("Email is registered with a different account type");
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

  private serializeOrder(
    order: {
      serviceId: string;
      caseId: string;
      status: string;
      guestName: string;
      guestEmail: string;
      guestPhone: string;
      bundleId: string | null;
      itemIds: Prisma.JsonValue;
      includeInspection: boolean;
      inspectionFee: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      vatAmount: Prisma.Decimal;
      total: Prisma.Decimal;
      transactionId: string | null;
      createdAt: Date;
      updatedAt: Date;
      listing: {
        id: string;
        title: string;
        location: string;
        propertyId: string | null;
        currency: string;
      } | null;
      transaction?: {
        id: string;
        caseId: string | null;
        status: TransactionStatus;
        payments: { id: string; status: PaymentStatus; transactionPublicId: string | null }[];
      } | null;
    },
    buyerPublicId: string | null,
  ) {
    if (!order.listing) {
      throw new NotFoundException("Order listing not found");
    }
    const latestPayment = order.transaction?.payments?.[0];
    return {
      serviceId: order.serviceId,
      caseId: order.caseId,
      status: order.status,
      guestName: order.guestName,
      guestEmail: order.guestEmail,
      guestPhone: order.guestPhone,
      buyerPublicId,
      bundleId: order.bundleId,
      itemIds: order.itemIds,
      includeInspection: order.includeInspection,
      inspectionFee: order.inspectionFee.toFixed(2),
      subtotal: order.subtotal.toFixed(2),
      vatAmount: order.vatAmount.toFixed(2),
      total: order.total.toFixed(2),
      currency: order.listing.currency,
      listing: {
        id: order.listing.id,
        title: order.listing.title,
        location: order.listing.location,
        propertyId: order.listing.propertyId,
      },
      transactionId: order.transactionId,
      transactionStatus: order.transaction?.status ?? null,
      paymentId: latestPayment?.id ?? null,
      paymentStatus: latestPayment?.status ?? null,
      transactionPublicId: latestPayment?.transactionPublicId ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async createOrder(dto: CreateGuestOrderDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (!this.isListingPubliclyVisible(listing)) {
      throw new BadRequestException("Listing is not available for guest checkout");
    }

    const totals = await this.calculateTotals(dto);
    const guestName = dto.guestName?.trim() || "Guest Buyer";
    const guestPhone = dto.guestPhone?.trim() || "";
    const buyer = await this.findOrCreateGuestBuyer(dto.guestEmail, guestName, guestPhone);

    const storedItemIds = dto.bundleId ? totals.resolvedItemIds : (dto.itemIds ?? []);

    let buyerPublicId = buyer.publicId;
    if (!buyerPublicId) {
      buyerPublicId = await this.sbrId.nextBuyerId(listing.location);
      await this.prisma.user.update({
        where: { id: buyer.id },
        data: { publicId: buyerPublicId },
      });
    }

    const serviceId = await this.sbrId.nextServiceId();
    const caseId = await this.sbrId.nextCaseId(listing.location);

    const serviceRequest = await this.prisma.serviceRequest.create({
      data: {
        serviceId,
        caseId,
        listingId: listing.id,
        buyerId: buyer.id,
        guestName,
        guestEmail: dto.guestEmail.trim().toLowerCase(),
        guestPhone,
        bundleId: dto.bundleId ?? null,
        itemIds: storedItemIds as Prisma.InputJsonValue,
        includeInspection: Boolean(dto.includeInspection),
        inspectionFee: totals.inspectionFee,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        total: totals.total,
        status: GUEST_ORDER_STATUS.PENDING_PAYMENT,
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
      },
    });

    return this.serializeOrder(serviceRequest, buyerPublicId);
  }

  async getOrder(serviceId: string) {
    const order = await this.prisma.serviceRequest.findUnique({
      where: { serviceId },
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
        transaction: {
          select: {
            id: true,
            caseId: true,
            status: true,
            payments: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                transactionPublicId: true,
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException("Order not found");

    let buyerPublicId: string | null = null;
    if (order.buyerId) {
      const buyer = await this.prisma.user.findUnique({
        where: { id: order.buyerId },
        select: { publicId: true },
      });
      buyerPublicId = buyer?.publicId ?? null;
    }

    return this.serializeOrder(order, buyerPublicId);
  }

  async initiatePayment(serviceId: string, dto: InitiateGuestPaymentDto) {
    const order = await this.prisma.serviceRequest.findUnique({
      where: { serviceId },
      include: {
        listing: true,
        transaction: {
          include: {
            payments: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== GUEST_ORDER_STATUS.PENDING_PAYMENT) {
      throw new BadRequestException("Order is not awaiting payment");
    }
    if (!order.listingId || !order.listing) {
      throw new NotFoundException("Order listing not found");
    }
    const listingId = order.listingId;
    const listingCurrency = order.listing.currency;

    const buyer = await this.findOrCreateGuestBuyer(dto.email, dto.name, dto.phone);
    const { firstName, lastName } = this.splitGuestName(dto.name);
    await this.prisma.user.update({
      where: { id: buyer.id },
      data: {
        firstName,
        lastName,
        phone: dto.phone,
      },
    });
    await this.prisma.serviceRequest.update({
      where: { id: order.id },
      data: {
        buyerId: buyer.id,
        guestName: dto.name.trim(),
        guestEmail: dto.email.trim().toLowerCase(),
        guestPhone: dto.phone.trim(),
      },
    });

    const existingPayment = order.transaction?.payments?.[0];
    if (
      existingPayment &&
      (existingPayment.status === PaymentStatus.PENDING ||
        existingPayment.status === PaymentStatus.PROCESSING)
    ) {
      const meta = existingPayment.metadata as { authorizationUrl?: string };
      return {
        paymentId: existingPayment.id,
        authorizationUrl: meta.authorizationUrl ?? null,
        reference: existingPayment.providerReference,
        transactionPublicId: existingPayment.transactionPublicId,
      };
    }

    const itemIds = Array.isArray(order.itemIds)
      ? (order.itemIds as string[])
      : [];

    const { payment, transactionPublicId } = await this.prisma.$transaction(async (tx) => {
        let transactionId = order.transaction?.id;
        if (!transactionId) {
          const created = await tx.transaction.create({
            data: {
              listingId: order.listingId,
              buyerId: buyer.id,
              caseId: order.caseId,
              status: TransactionStatus.INITIATED,
            },
          });
          transactionId = created.id;
          await tx.serviceRequest.update({
            where: { id: order.id },
            data: { transactionId },
          });
          await tx.dueDiligenceOrder.create({
            data: {
              transactionId,
              buyerId: buyer.id,
              serviceId: order.serviceId,
              bundleId: order.bundleId,
              itemIds: itemIds as Prisma.InputJsonValue,
              subtotal: order.subtotal,
              vatAmount: order.vatAmount,
              total: order.total,
              status: "PENDING",
            },
          });
        }

        const transactionPublicId = await this.sbrId.nextTransactionId();
        const payment = await tx.payment.create({
          data: {
            payerId: buyer.id,
            listingId,
            transactionId,
            amount: order.total,
            currency: listingCurrency,
            status: PaymentStatus.PENDING,
            intent: PaymentIntent.DD_SERVICE,
            provider: "paystack",
            transactionPublicId,
            metadata: {
              serviceRequestId: order.id,
              guestCheckout: true,
              callbackUrl: dto.callbackUrl,
            } as object,
          },
        });

        await tx.transaction.update({
          where: { id: transactionId },
          data: { status: TransactionStatus.IN_PROGRESS },
        });

        return { payment, transactionPublicId };
      });

    const amountMinor = Math.round(Number(order.total) * 100);

    if (!this.paystack.isConfigured()) {
      const mockRef = `mock_guest_${payment.id}`;
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { providerReference: mockRef, status: PaymentStatus.SUCCEEDED },
        });
        await tx.transaction.update({
          where: { id: payment.transactionId! },
          data: { status: TransactionStatus.DD_PURCHASED },
        });
        await tx.dueDiligenceOrder.updateMany({
          where: { transactionId: payment.transactionId! },
          data: { status: "PAID" },
        });
        await tx.listing.updateMany({
          where: { id: listingId, status: ListingStatus.LIVE },
          data: { status: ListingStatus.UNDER_OFFER },
        });
      });
      await this.completePayment(payment.id);
      return {
        paymentId: payment.id,
        authorizationUrl: `${dto.callbackUrl}?mock=1&ref=${mockRef}&paymentId=${payment.id}`,
        reference: mockRef,
        transactionPublicId,
      };
    }

    let initialized;
    try {
      initialized = await this.paystack.initializeTransaction({
        email: this.paystack.customerEmail(dto.email, buyer.id),
        amountMinor,
        currency: listingCurrency,
        callbackUrl: dto.callbackUrl,
        metadata: { paymentId: payment.id, serviceRequestId: order.id },
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
          guestCheckout: true,
          callbackUrl: dto.callbackUrl,
          authorizationUrl: initialized.authorizationUrl,
          accessCode: initialized.accessCode,
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
   * Guest-checkout completion hook invoked from the payments webhook / mock-success path.
   */
  async completePayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        transaction: {
          include: {
            listing: true,
            serviceRequest: true,
          },
        },
      },
    });
    if (!payment) return;

    const metadata = payment.metadata as { serviceRequestId?: string; guestCheckout?: boolean };
    if (!metadata.guestCheckout && !metadata.serviceRequestId) return;

    const serviceRequest =
      payment.transaction?.serviceRequest ??
      (metadata.serviceRequestId
        ? await this.prisma.serviceRequest.findUnique({ where: { id: metadata.serviceRequestId } })
        : null);
    if (!serviceRequest || serviceRequest.status === GUEST_ORDER_STATUS.PAID) return;

    const buyer = await this.prisma.user.findUnique({
      where: { id: payment.payerId },
      select: { id: true, publicId: true, email: true },
    });
    if (!buyer) return;

    const activationToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceRequest.update({
        where: { id: serviceRequest.id },
        data: { status: GUEST_ORDER_STATUS.PAID },
      });
      await tx.accountActivationToken.create({
        data: {
          userId: buyer.id,
          token: activationToken,
          expiresAt,
        },
      });
    });

    const serviceLabels = await this.resolveServiceLabels(
      serviceRequest.bundleId,
      serviceRequest.itemIds,
      serviceRequest.includeInspection,
    );

    const activationLink = `${this.activationBaseUrl()}/activate/${activationToken}`;
    void this.email.sendPaymentReceipt(buyer.email, {
      serviceId: serviceRequest.serviceId,
      transactionPublicId: payment.transactionPublicId ?? payment.id,
      caseId: serviceRequest.caseId,
      buyerPublicId: buyer.publicId ?? buyer.id,
      propertyTitle: payment.transaction?.listing?.title ?? "",
      propertyLocation: payment.transaction?.listing?.location ?? "",
      services: serviceLabels,
      total: serviceRequest.total.toFixed(2),
      currency: payment.currency,
      activationLink,
      guestName: serviceRequest.guestName,
    });

    const listingTitle = payment.transaction?.listing?.title ?? "property";
    void this.notifications.create({
      userId: buyer.id,
      type: NotificationType.DD_PAYMENT_SUCCEEDED,
      title: "Due diligence payment received",
      body: `Your due diligence payment for "${listingTitle}" was successful. Activate your account to track progress.`,
      entityId: payment.transactionId ?? payment.id,
      entityType: NotificationEntityType.Transaction,
    });
    if (payment.transaction?.listing?.sellerId) {
      void this.notifications.create({
        userId: payment.transaction.listing.sellerId,
        type: NotificationType.DD_PAYMENT_SUCCEEDED,
        title: "Property reserved",
        body: `"${listingTitle}" is now under offer while due diligence is in progress.`,
        entityId: payment.transaction.listing.id,
        entityType: NotificationEntityType.Listing,
      });
    }
    void this.notifications.createForStaff({
      type: NotificationType.DD_PAYMENT_SUCCEEDED,
      title: "Guest due diligence payment received",
      body: `A guest buyer paid for due diligence on "${listingTitle}".`,
      entityId: payment.transactionId ?? payment.id,
      entityType: NotificationEntityType.Transaction,
    });
  }

  private async resolveServiceLabels(
    bundleId: string | null,
    itemIds: Prisma.JsonValue,
    includeInspection: boolean,
  ): Promise<string[]> {
    const labels: string[] = [];
    if (bundleId) {
      const bundle = await this.prisma.serviceBundle.findUnique({ where: { id: bundleId } });
      if (bundle) labels.push(bundle.name);
    } else if (Array.isArray(itemIds) && itemIds.length > 0) {
      const items = await this.prisma.serviceCatalogItem.findMany({
        where: { id: { in: itemIds as string[] } },
        select: { name: true },
      });
      labels.push(...items.map((i) => i.name));
    }
    if (includeInspection) labels.push("Property inspection");
    return labels;
  }
}
