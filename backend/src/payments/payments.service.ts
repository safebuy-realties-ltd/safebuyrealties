import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  UserRole,
  PaymentStatus,
  ListingStatus,
  TransactionStatus,
  PaymentIntent,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isInternalRole } from "../common/user-roles";
import { PaystackService } from "./paystack.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  NotificationEntityType,
  NotificationType,
} from "../notifications/notification-types.constants";
import { EscrowService } from "../escrow/escrow.service";
import { GuestCheckoutService } from "../guest-checkout/guest-checkout.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { InitiatePaymentDto } from "./dto/initiate-payment.dto";
import { StandaloneDdService } from "../standalone-dd/standalone-dd.service";
import { MOCK_REFERENCE_PREFIX, isMockReference } from "../config/payments-guard";
import { MoneyFields, withMoneyOperation } from "../common/logging/money-operation";

@Injectable()
export class PaymentsService {
  /**
   * Delegates to the structured logger installed in main.ts, so these lines carry the correlation
   * id of the request that moved the money without this class knowing a request exists.
   */
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private escrow: EscrowService,
    private paystack: PaystackService,
    private guestCheckout: GuestCheckoutService,
    private standaloneDd: StandaloneDdService,
  ) {}

  private async notifyDdPaymentSucceeded(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        listing: { select: { id: true, title: true, sellerId: true } },
        buyer: { select: { id: true } },
      },
    });
    if (!tx?.listing) return;

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
    return isInternalRole(role);
  }

  getPaymentConfig() {
    return {
      enabled: this.paystack.isConfigured(),
      publicKey: this.paystack.publicKey() ?? null,
      mockMode: !this.paystack.isConfigured(),
    };
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
      // Derived from the reference prefix rather than a stored column: mock mode is a
      // property of how the record was created, and there is no schema field for it.
      isMock: isMockReference(p.providerReference),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  /**
   * E7-S1 criterion 5. The public method is the log envelope and nothing else; the work moved into
   * `initiatePayment` unchanged. Splitting it this way means the outcome line cannot be lost to an
   * early `return` or a `throw` added later, because no branch of the body is reachable without
   * passing back through the wrapper.
   */
  async initiate(dto: InitiatePaymentDto, actor: JwtPayload) {
    return withMoneyOperation(
      this.logger,
      "payment.initialize",
      {
        amount: String(dto.amount),
        amountMinor: Math.round(Number(dto.amount) * 100),
        currency: dto.currency ?? "NGN",
        provider: "paystack",
        intent: dto.intent ?? PaymentIntent.DD_SERVICE,
        listingId: dto.listingId,
        transactionId: dto.transactionId,
        subjectUserId: actor.sub,
      },
      (record) => this.initiatePayment(dto, actor, record),
    );
  }

  private async initiatePayment(
    dto: InitiatePaymentDto,
    actor: JwtPayload,
    record: (extra: MoneyFields) => void,
  ) {
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

    // The row id exists only now. Recorded rather than logged separately so both the start and the
    // outcome line for this operation can be found by the same identifier.
    record({ paymentId: payment.id });

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
    const amountMinor = Math.round(Number(dto.amount) * 100);

    if (!this.paystack.isConfigured()) {
      const mockRef = `${MOCK_REFERENCE_PREFIX}${payment.id}`;
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerReference: mockRef, status: PaymentStatus.PROCESSING },
      });
      await this.applyPaymentChargeSuccess(payment.id);
      record({ reference: mockRef, mock: true });
      return {
        paymentId: payment.id,
        authorizationUrl: `${dto.callbackUrl}?mock=1&ref=${mockRef}&paymentId=${payment.id}`,
        reference: mockRef,
        accessCode: null as string | null,
      };
    }

    let initialized;
    try {
      initialized = await this.paystack.initializeTransaction({
        email: this.paystack.customerEmail(payer.email, payer.id),
        amountMinor,
        currency,
        callbackUrl: dto.callbackUrl,
        metadata: { paymentId: payment.id },
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
          callbackUrl: dto.callbackUrl,
          authorizationUrl: initialized.authorizationUrl,
        } as object,
      },
    });

    record({ reference: initialized.reference });

    return {
      paymentId: payment.id,
      authorizationUrl: initialized.authorizationUrl,
      reference: initialized.reference,
      accessCode: initialized.accessCode,
    };
  }

  /**
   * Marks the payment succeeded and applies intent-specific side effects (same path as
   * Paystack charge.success and mock-mode auto-success).
   */
  private async applyPaymentChargeSuccess(paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) return;
    const meta = p.metadata as {
      serviceRequestId?: string;
      guestCheckout?: boolean;
      standaloneDd?: boolean;
    };

    if (meta.standaloneDd) {
      await this.standaloneDd.completePayment(paymentId);
      return;
    }

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
            select: { listingId: true, source: true },
          });
          const listingId = txRow?.listingId ?? p.listingId ?? null;
          if (listingId && txRow?.source !== "STANDALONE") {
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
                notIn: [TransactionStatus.COMPLETED, TransactionStatus.PURCHASE_IN_ESCROW],
              },
            },
            data: { status: TransactionStatus.PURCHASE_IN_ESCROW },
          });
        }
      }
    });

    // Fire-and-forget notifications — outside the DB transaction.
    if (
      p.transactionId &&
      p.intent === PaymentIntent.DD_SERVICE &&
      !meta.guestCheckout &&
      !meta.standaloneDd
    ) {
      void this.notifyDdPaymentSucceeded(p.transactionId);
    }
    if (p.transactionId && p.intent === PaymentIntent.PROPERTY_PURCHASE) {
      await this.escrow.hold(p.transactionId, p.amount);
    }

    if (meta.serviceRequestId || meta.guestCheckout) {
      await this.guestCheckout.completePayment(paymentId);
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
    return withMoneyOperation(
      this.logger,
      "payment.verify",
      { paymentId, subjectUserId: actor.sub, provider: "paystack" },
      (record) => this.verifyPayment(paymentId, actor, record),
    );
  }

  private async verifyPayment(
    paymentId: string,
    actor: JwtPayload,
    record: (extra: MoneyFields) => void,
  ) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.payerId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }
    record({
      amount: payment.amount.toString(),
      amountMinor: Math.round(Number(payment.amount) * 100),
      currency: payment.currency,
      reference: payment.providerReference ?? undefined,
    });
    if (payment.status === PaymentStatus.SUCCEEDED) {
      record({ providerStatus: "already-succeeded" });
      return this.serializePayment(payment);
    }

    if (!this.paystack.isConfigured()) {
      record({ providerStatus: "not-configured", mock: true });
      return this.serializePayment(payment);
    }
    if (!payment.providerReference) {
      throw new BadRequestException("Payment has no provider reference to verify");
    }

    let paystackStatus: string | undefined;
    try {
      paystackStatus = await this.paystack.verifyTransaction(payment.providerReference);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Paystack verify failed";
      throw new BadRequestException(message);
    }

    record({ providerStatus: paystackStatus });

    if (paystackStatus === "success") {
      await this.applyPaymentChargeSuccess(payment.id);
    } else if (paystackStatus === "failed") {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
    }

    const updated = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return this.serializePayment(updated);
  }

  verifyPaystackSignature(rawBody: Buffer, signature: string | undefined): boolean {
    return this.paystack.verifyWebhookSignature(rawBody, signature);
  }

  async handlePaystackWebhook(payload: {
    event?: string;
    data?: { reference?: string; status?: string };
  }) {
    // The envelope logs the event name, the reference and the provider's own status — the three
    // fields needed to reconcile against Paystack's dashboard. The payload itself is never logged:
    // it carries customer and authorization data that has no business in a log line.
    return withMoneyOperation(
      this.logger,
      "payment.webhook",
      {
        provider: "paystack",
        providerEvent: payload.event,
        providerStatus: payload.data?.status,
        reference: payload.data?.reference,
      },
      (record) => this.applyPaystackWebhook(payload, record),
    );
  }

  private async applyPaystackWebhook(
    payload: { event?: string; data?: { reference?: string; status?: string } },
    record: (extra: MoneyFields) => void,
  ) {
    const ref = payload.data?.reference;
    if (!ref) return { received: true };
    const payment = await this.prisma.payment.findFirst({
      where: { providerReference: ref },
    });
    if (!payment) {
      record({ outcome: "no-matching-payment" });
      return { received: true };
    }
    record({
      paymentId: payment.id,
      amount: payment.amount.toString(),
      amountMinor: Math.round(Number(payment.amount) * 100),
      currency: payment.currency,
      subjectUserId: payment.payerId,
    });

    const success = payload.event === "charge.success" && payload.data?.status === "success";
    const failed = payload.event === "charge.failed" || payload.data?.status === "failed";

    if (success) {
      record({ outcome: "charge-succeeded" });
      await this.applyPaymentChargeSuccess(payment.id);
    } else if (failed) {
      record({ outcome: "charge-failed" });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
    } else {
      record({ outcome: "ignored" });
    }
    return { received: true };
  }
}
