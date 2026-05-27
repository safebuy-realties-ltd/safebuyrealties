import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  UserRole,
  PaymentStatus,
  ListingStatus,
  TransactionStatus,
  PaymentIntent,
  Prisma,
} from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  NotificationEntityType,
  NotificationType,
} from "../notifications/notification-types.constants";
import { EscrowService } from "../escrow/escrow.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { InitiatePaymentDto } from "./dto/initiate-payment.dto";

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private notifications: NotificationsService,
    private escrow: EscrowService,
  ) {}

  private async notifyDdPaymentSucceeded(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        listing: { select: { id: true, title: true, sellerId: true } },
        buyer: { select: { id: true } },
      },
    });
    if (!tx) return;

    const listingTitle = tx.listing.title;
    void this.notifications.create({
      userId: tx.buyerId,
      type: NotificationType.DD_PAYMENT_SUCCEEDED,
      title: "Due diligence payment received",
      body: `Your due diligence payment for "${listingTitle}" was successful. Verification work will begin shortly.`,
      entityId: transactionId,
      entityType: NotificationEntityType.Transaction,
    });
    void this.notifications.create({
      userId: tx.listing.sellerId,
      type: NotificationType.DD_PAYMENT_SUCCEEDED,
      title: "Property reserved",
      body: `"${listingTitle}" is now under offer while due diligence is in progress.`,
      entityId: tx.listing.id,
      entityType: NotificationEntityType.Listing,
    });
    void this.notifications.createForStaff({
      type: NotificationType.DD_PAYMENT_SUCCEEDED,
      title: "Due diligence payment received",
      body: `A buyer paid for due diligence on "${listingTitle}". Begin verification work.`,
      entityId: transactionId,
      entityType: NotificationEntityType.Transaction,
    });
  }

  private isStaff(role: UserRole) {
    return role === UserRole.STAFF || role === UserRole.ADMIN;
  }

  /** Supports PAYSTACK_SECRET_KEY (production) or PAYSTACK_TEST_SECRET_KEY (local .env). */
  private paystackSecret(): string | undefined {
    const primary = this.config.get<string>("PAYSTACK_SECRET_KEY")?.trim();
    if (primary) return primary;
    return this.config.get<string>("PAYSTACK_TEST_SECRET_KEY")?.trim() || undefined;
  }

  /**
   * Calls the Paystack API and parses the JSON body, translating transport-level failures
   * (provider unreachable, non-JSON gateway responses) into a clean 503 rather than a raw 500.
   */
  private async paystackJson<T>(url: string, init?: RequestInit): Promise<{ res: Response; json: T }> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      throw new ServiceUnavailableException("Could not reach the payment provider. Please try again.");
    }
    try {
      return { res, json: (await res.json()) as T };
    } catch {
      throw new ServiceUnavailableException("The payment provider returned an unexpected response.");
    }
  }

  private serializePayment(p: {
    id: string;
    listingId: string | null;
    transactionId: string | null;
    payerId: string;
    amount: Prisma.Decimal;
    currency: string;
    provider: string;
    providerReference: string | null;
    status: PaymentStatus;
    intent: PaymentIntent;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      listingId: p.listingId,
      transactionId: p.transactionId,
      payerId: p.payerId,
      amount: p.amount.toString(),
      currency: p.currency,
      provider: p.provider,
      providerReference: p.providerReference,
      status: p.status,
      intent: p.intent,
      metadata: p.metadata,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  /** Paystack rejects `.test` seed emails — use a valid-format address for initialize only. */
  private paystackCustomerEmail(email: string, userId: string): string {
    const trimmed = email.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !trimmed.endsWith(".test")) {
      return trimmed;
    }
    const local = trimmed.split("@")[0]?.replace(/[^a-zA-Z0-9._+-]/g, "") || "buyer";
    return `${local}+${userId.slice(0, 8)}@example.com`;
  }

  async initiate(dto: InitiatePaymentDto, actor: JwtPayload) {
    if (actor.role !== UserRole.BUYER && !this.isStaff(actor.role)) {
      throw new ForbiddenException("Only buyers can initiate payments");
    }
    if (!dto.listingId && !dto.transactionId) {
      throw new BadRequestException("Provide listingId or transactionId");
    }
    if (dto.listingId) {
      const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
      if (!listing) throw new NotFoundException("Listing not found");
      if (listing.status !== ListingStatus.LIVE && !this.isStaff(actor.role)) {
        throw new BadRequestException("Payments are only allowed for live listings");
      }
    }
    if (dto.transactionId) {
      const tx = await this.prisma.transaction.findUnique({ where: { id: dto.transactionId } });
      if (!tx) throw new NotFoundException("Transaction not found");
      if (tx.buyerId !== actor.sub && !this.isStaff(actor.role)) {
        throw new ForbiddenException();
      }
      if (tx.status === TransactionStatus.COMPLETED) {
        throw new BadRequestException("This transaction is already completed");
      }
    }

    const currency = dto.currency ?? "NGN";
    const intent = dto.intent ?? PaymentIntent.DD_SERVICE;
    const payment = await this.prisma.payment.create({
      data: {
        payerId: actor.sub,
        amount: dto.amount,
        currency,
        listingId: dto.listingId ?? null,
        transactionId: dto.transactionId ?? null,
        status: PaymentStatus.PENDING,
        intent,
        provider: "paystack",
        metadata: {
          callbackUrl: dto.callbackUrl,
          ...(dto.ddOrderId ? { ddOrderId: dto.ddOrderId } : {}),
        } as object,
      },
    });

    if (dto.transactionId) {
      await this.prisma.transaction.updateMany({
        where: {
          id: dto.transactionId,
          status: TransactionStatus.INITIATED,
          ...(this.isStaff(actor.role) ? {} : { buyerId: actor.sub }),
        },
        data: { status: TransactionStatus.IN_PROGRESS },
      });
    }

    const payer = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.sub } });
    const secret = this.paystackSecret();
    const amountMinor = Math.round(Number(dto.amount) * 100);

    if (!secret) {
      const mockRef = `mock_${payment.id}`;
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerReference: mockRef, status: PaymentStatus.PROCESSING },
      });
      await this.applyPaymentChargeSuccess(payment.id);
      return {
        paymentId: payment.id,
        authorizationUrl: `${dto.callbackUrl}?mock=1&ref=${mockRef}&paymentId=${payment.id}`,
        reference: mockRef,
        accessCode: null as string | null,
      };
    }

    const { res, json } = await this.paystackJson<{
      status: boolean;
      message: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    }>("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: this.paystackCustomerEmail(payer.email, payer.id),
        amount: amountMinor,
        currency,
        callback_url: dto.callbackUrl,
        metadata: { paymentId: payment.id },
      }),
    });
    if (!res.ok || !json.status || !json.data?.reference) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, metadata: { error: json.message } as object },
      });
      throw new BadRequestException(json.message || "Paystack initialize failed");
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerReference: json.data.reference,
        status: PaymentStatus.PROCESSING,
        metadata: {
          callbackUrl: dto.callbackUrl,
          authorizationUrl: json.data.authorization_url,
        } as object,
      },
    });

    return {
      paymentId: payment.id,
      authorizationUrl: json.data.authorization_url,
      reference: json.data.reference,
      accessCode: json.data.access_code,
    };
  }

  /**
   * Marks the payment succeeded and applies intent-specific side effects (same path as
   * Paystack charge.success and mock-mode auto-success).
   */
  private async applyPaymentChargeSuccess(paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: p.id },
        data: { status: PaymentStatus.SUCCEEDED },
      });

      if (p.intent === PaymentIntent.DD_SERVICE) {
        if (p.transactionId) {
          await tx.transaction.updateMany({
            where: {
              id: p.transactionId,
              status: { in: [TransactionStatus.INITIATED, TransactionStatus.IN_PROGRESS] },
            },
            data: { status: TransactionStatus.DD_PURCHASED },
          });

          // Resolve the listing tied to the transaction (preferred) or the payment itself.
          const txRow = await tx.transaction.findUnique({
            where: { id: p.transactionId },
            select: { listingId: true },
          });
          const listingId = txRow?.listingId ?? p.listingId ?? null;
          if (listingId) {
            await tx.listing.updateMany({
              where: { id: listingId, status: ListingStatus.LIVE },
              data: { status: ListingStatus.UNDER_OFFER },
            });
          }

          await tx.dueDiligenceOrder.updateMany({
            where: { transactionId: p.transactionId },
            data: { status: "PAID" },
          });
        }
      } else if (p.intent === PaymentIntent.PROPERTY_PURCHASE) {
        if (p.transactionId) {
          await tx.transaction.updateMany({
            where: {
              id: p.transactionId,
              status: {
                notIn: [
                  TransactionStatus.COMPLETED,
                  TransactionStatus.PURCHASE_IN_ESCROW,
                ],
              },
            },
            data: { status: TransactionStatus.PURCHASE_IN_ESCROW },
          });
        }
      }
    });

    // Fire-and-forget notifications — outside the DB transaction.
    if (p.transactionId && p.intent === PaymentIntent.DD_SERVICE) {
      void this.notifyDdPaymentSucceeded(p.transactionId);
    }
    if (p.transactionId && p.intent === PaymentIntent.PROPERTY_PURCHASE) {
      await this.escrow.hold(p.transactionId, p.amount);
    }
  }

  async findOne(id: string, actor: JwtPayload) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Payment not found");
    if (p.payerId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }
    return this.serializePayment(p);
  }

  /**
   * Confirms a payment by calling Paystack's verify endpoint. Used by the inline (popup)
   * checkout flow on success, since Paystack webhooks cannot reach localhost during dev.
   * Idempotent: re-verifying a succeeded payment is a no-op.
   */
  async verifyTransaction(paymentId: string, actor: JwtPayload) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.payerId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }
    if (payment.status === PaymentStatus.SUCCEEDED) {
      return this.serializePayment(payment);
    }

    const secret = this.paystackSecret();
    // Mock mode (no Paystack key): initiate() already auto-applied success.
    if (!secret) {
      return this.serializePayment(payment);
    }
    if (!payment.providerReference) {
      throw new BadRequestException("Payment has no provider reference to verify");
    }

    const { res, json } = await this.paystackJson<{
      status: boolean;
      message: string;
      data?: { status?: string };
    }>(`https://api.paystack.co/transaction/verify/${encodeURIComponent(payment.providerReference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok || !json.status) {
      throw new BadRequestException(json.message || "Paystack verify failed");
    }

    if (json.data?.status === "success") {
      await this.applyPaymentChargeSuccess(payment.id);
    } else if (json.data?.status === "failed") {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
    }

    const updated = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return this.serializePayment(updated);
  }

  verifyPaystackSignature(rawBody: Buffer, signature: string | undefined): boolean {
    const secret = this.paystackSecret();
    if (!secret || !signature) return false;
    const hash = createHmac("sha512", secret).update(rawBody).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async handlePaystackWebhook(payload: {
    event?: string;
    data?: { reference?: string; status?: string };
  }) {
    const ref = payload.data?.reference;
    if (!ref) return { received: true };
    const payment = await this.prisma.payment.findFirst({
      where: { providerReference: ref },
    });
    if (!payment) return { received: true };

    const success = payload.event === "charge.success" && payload.data?.status === "success";
    const failed = payload.event === "charge.failed" || payload.data?.status === "failed";

    if (success) {
      await this.applyPaymentChargeSuccess(payment.id);
    } else if (failed) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
    }
    return { received: true };
  }
}
