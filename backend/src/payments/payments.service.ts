import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
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
import { TransactionStateService } from "../transactions/transaction-state.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import {
  PURCHASE_BLOCK,
  PURCHASE_FACTS_INCLUDE,
  evaluatePurchaseReadiness,
  purchaseFactsFrom,
  purchaseFlagsFrom,
  type PurchaseReadiness,
} from "../transactions/purchase-readiness";
import { StartPurchaseDto } from "./dto/start-purchase.dto";
import {
  assessFreshness,
  claimPaymentForSuccess,
  webhookMaxAgeMs,
  type WebhookTiming,
} from "./webhook-idempotency";

/**
 * What this service reads out of a Paystack webhook, and nothing more.
 *
 * E2-S2 widened `data` to carry the gateway's own timestamps. They were previously dropped at the
 * type boundary, which is why nothing downstream could tell a retry from a payload captured last
 * month and posted back. Everything is optional and the timing fields are `unknown`: this is the
 * outer edge of the system and the body is whatever the network sent, not whatever we hoped for.
 */
export interface PaystackWebhookPayload {
  event?: string;
  data?: { reference?: string; status?: string } & WebhookTiming;
}

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
    private transactionState: TransactionStateService,
    private featureFlags: FeatureFlagsService,
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

  /**
   * E1-S4. Starts the purchase of the property a transaction is against.
   *
   * It is a route of its own rather than an intent on `initiate` for two reasons. The amount is the
   * full price of the listing and the server has to be the one that says so, and the whole step is
   * behind the `property_purchase` flag, so the route can be dark while `initiate` stays open.
   *
   * The order below is the story's second criterion. Readiness is decided first, the transaction is
   * moved to `PURCHASE_PENDING` second, and only then is the gateway called. A buyer who opens a
   * checkout and closes the tab therefore leaves a transaction that says a purchase was started and
   * never finished, which is a different thing from one that was never started at all, and the
   * failure paths below know how to unwind it.
   */
  async startPurchase(dto: StartPurchaseDto, actor: JwtPayload) {
    return withMoneyOperation(
      this.logger,
      "payment.purchase.initialize",
      {
        provider: "paystack",
        intent: PaymentIntent.PROPERTY_PURCHASE,
        transactionId: dto.transactionId,
        subjectUserId: actor.sub,
      },
      (record) => this.startPropertyPurchase(dto, actor, record),
    );
  }

  private async startPropertyPurchase(
    dto: StartPurchaseDto,
    actor: JwtPayload,
    record: (extra: MoneyFields) => void,
  ) {
    if (actor.role !== UserRole.BUYER && !this.isStaff(actor.role)) {
      throw new ForbiddenException("Only buyers can initiate payments");
    }

    const tx = await this.prisma.transaction.findUnique({
      where: { id: dto.transactionId },
      include: { listing: true, ...PURCHASE_FACTS_INCLUDE },
    });
    if (!tx) throw new NotFoundException("Transaction not found");
    if (tx.buyerId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }

    // The same call the transaction serializer makes, so the button the buyer was shown and the
    // decision taken here cannot disagree. This is the one that matters: the other only hides a
    // button, and a hidden button is a courtesy rather than a control.
    const readiness = evaluatePurchaseReadiness(
      purchaseFactsFrom(tx, purchaseFlagsFrom(this.featureFlags)),
    );
    if (!readiness.canPurchase) {
      record({ outcome: `blocked-${readiness.blockedBy}` });
      throw this.purchaseRefusal(readiness);
    }

    if (!tx.listing) throw new NotFoundException("Listing not found");
    const amount = tx.listing.price;
    if (Number(amount) <= 0) {
      throw new BadRequestException("This property has no price set, so it cannot be purchased");
    }
    record({ amount: amount.toString(), amountMinor: Math.round(Number(amount) * 100) });

    // Criterion 2. Before the payment row and before the gateway, because this is the record that an
    // attempt happened at all, and a checkout the buyer walks away from writes nothing else.
    await this.transactionState.advance(
      this.prisma,
      tx.id,
      TransactionStatus.PURCHASE_PENDING,
    );

    return this.initiatePayment(
      {
        amount: Number(amount),
        currency: tx.listing.currency,
        transactionId: tx.id,
        listingId: tx.listingId ?? undefined,
        callbackUrl: dto.callbackUrl,
        intent: PaymentIntent.PROPERTY_PURCHASE,
      },
      actor,
      record,
    );
  }

  /**
   * Turns a refusal into the status code that describes it, keeping the machine-readable code.
   *
   * The browser needs to tell these apart to say anything useful, and prose in a message is not
   * something a client should be parsing, so `blockedBy` travels in the body alongside the reason.
   *
   * A dark flag answers 404 rather than 403, which is what `FeatureGuard` does on the route itself.
   * It is repeated here because this method is also reachable from a request that raced the flag
   * being turned off, and a feature that is off should not confirm it exists.
   */
  private purchaseRefusal(readiness: PurchaseReadiness) {
    const body = { message: readiness.reason, blockedBy: readiness.blockedBy };
    if (readiness.blockedBy === PURCHASE_BLOCK.FEATURE_OFF) {
      return new NotFoundException(body);
    }
    if (
      readiness.blockedBy === PURCHASE_BLOCK.VERDICT_AGAINST ||
      readiness.blockedBy === PURCHASE_BLOCK.KYC_REQUIRED
    ) {
      return new ForbiddenException(body);
    }
    // Everything else is a disagreement about where the transaction is, which is a conflict rather
    // than a bad request: the same call would have been fine a status earlier or later.
    return new ConflictException(body);
  }

  /**
   * Criterion 4. Puts a transaction back where it was when a purchase checkout does not complete.
   *
   * Called from every place a payment can stop short: the gateway refusing to open a checkout, a
   * verify that comes back failed, a `charge.failed` delivery, and the buyer closing the window. It
   * is keyed off the payment row rather than the caller, so none of those four has to remember what
   * kind of payment it was holding.
   *
   * Nothing is deleted, because nothing was created. An escrow hold is only ever placed by a
   * successful charge, so a purchase that failed leaves no escrow row to clean up.
   */
  private async returnAbandonedPurchase(payment: {
    intent: PaymentIntent;
    transactionId: string | null;
  }) {
    if (payment.intent !== PaymentIntent.PROPERTY_PURCHASE || !payment.transactionId) return;
    await this.transactionState.revertIfAt(
      this.prisma,
      payment.transactionId,
      TransactionStatus.PURCHASE_PENDING,
      TransactionStatus.DD_COMPLETE,
    );
  }

  /**
   * The buyer closed the checkout window. E1-S4 criterion 4.
   *
   * The gateway says nothing when a buyer dismisses the popup, so without this the transaction sits
   * at `PURCHASE_PENDING` with no payment behind it and no way back to the button. The browser calls
   * this on cancel and the transaction returns to `DD_COMPLETE`.
   *
   * It refuses anything that is not a property purchase on purpose. A due diligence payment that is
   * abandoned changes no transaction status, so there would be nothing for this to do, and a route
   * that silently does nothing is worse than one that says what it is for.
   */
  async abandonPayment(paymentId: string, actor: JwtPayload) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.payerId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }
    if (payment.intent !== PaymentIntent.PROPERTY_PURCHASE) {
      throw new BadRequestException("Only a property purchase checkout can be abandoned");
    }

    // Conditional for the same reason the webhook's failed branch is. The buyer closing the window
    // a moment after paying is an ordinary race, and the money landing has to win it.
    const marked = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: { not: PaymentStatus.SUCCEEDED } },
      data: { status: PaymentStatus.FAILED },
    });
    if (marked.count > 0) {
      await this.returnAbandonedPurchase(payment);
    }

    const updated = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return this.serializePayment(updated);
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
    const intent = dto.intent ?? PaymentIntent.DD_SERVICE;
    if (dto.listingId) {
      const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
      if (!listing) throw new NotFoundException("Listing not found");
      // A property being bought is not live and should not be. Paying for due diligence is what
      // took it to UNDER_OFFER in the first place, so insisting on LIVE here would mean the only
      // buyer entitled to purchase is the one buyer the listing is now closed to. The purchase has
      // its own gate a few methods up, and that one reads the transaction rather than the listing.
      const mustBeLive = intent !== PaymentIntent.PROPERTY_PURCHASE;
      if (mustBeLive && listing.status !== ListingStatus.LIVE && !this.isStaff(actor.role)) {
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
      // Mock mode initialises and succeeds in one call, so this is always the first claim. The
      // return is ignored rather than asserted: a second initialize creates a new payment row.
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
      // The gateway never opened a checkout, so the buyer never saw one. Leaving them at
      // PURCHASE_PENDING would read as a purchase in flight when nothing was ever in flight.
      await this.returnAbandonedPurchase(payment);
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
   *
   * E2-S2: returns whether this call is the one that applied it. Every side effect below hangs off
   * `claimPaymentForSuccess`, so a replayed webhook, a second browser tab hitting verify, and a
   * retry racing the original all reach here and exactly one of them proceeds. The claim replaces
   * the unconditional `payment.update` that used to sit at the top of the transaction: that update
   * was what made a duplicate re-run everything, because it succeeded every time it was called.
   */
  private async applyPaymentChargeSuccess(paymentId: string): Promise<boolean> {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) return false;
    const meta = p.metadata as {
      serviceRequestId?: string;
      guestCheckout?: boolean;
      standaloneDd?: boolean;
    };

    if (meta.standaloneDd) {
      // This path completes inside StandaloneDdService, which runs its own transaction and sets
      // SUCCEEDED itself. Claiming first is still what stops the replay: it is the account
      // activation token and the notifications in there that must not happen twice.
      if (!(await claimPaymentForSuccess(this.prisma, paymentId))) return false;
      await this.standaloneDd.completePayment(paymentId);
      return true;
    }

    const applied = await this.prisma.$transaction(async (tx) => {
      // Inside the transaction on purpose. If anything below throws, the claim rolls back with it
      // and the gateway's next retry can legitimately re-apply, rather than finding the payment
      // marked done with half its side effects missing.
      if (!(await claimPaymentForSuccess(tx, p.id))) return false;

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
          // E1-S4 criterion 3, and the gap E1-S2 recorded, closed for the purchase path. It is the
          // state machine that moves this now, through the same client the claim was made on, so
          // the payment and the transaction commit together or not at all.
          //
          // The machine refuses a transaction that has already completed, where the loose update it
          // replaces quietly matched nothing and then let the escrow hold below run anyway, putting
          // fresh money against a released purchase. A refusal here rolls the claim back with it,
          // the payment stays unclaimed, and the money is left visibly unreconciled rather than
          // invisibly misapplied. That is the right way round for somebody to notice.
          await this.transactionState.advance(
            tx,
            p.transactionId,
            TransactionStatus.PURCHASE_IN_ESCROW,
          );
        }
      }
      return true;
    });

    // These three are the reason the claim exists. They are outside the transaction, because a
    // notification cannot be rolled back and an escrow hold writes through another service, so
    // nothing but the claim stands between a replayed delivery and a second hold on the same money.
    if (!applied) return false;

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
    return true;
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
      // The webhook and this verify call race whenever both reach us. The buyer's browser
      // returning from Paystack while Paystack's own delivery is in flight is the ordinary case,
      // not the rare one. The status guard above catches it once the row is committed; the claim
      // catches it in the window before that.
      const applied = await this.applyPaymentChargeSuccess(payment.id);
      record({ outcome: applied ? "charge-succeeded" : "already-applied" });
    } else if (paystackStatus === "failed") {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      // Criterion 4. The card was declined, so the buyer goes back to the button they pressed.
      await this.returnAbandonedPurchase(payment);
    }

    const updated = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return this.serializePayment(updated);
  }

  verifyPaystackSignature(rawBody: Buffer, signature: string | undefined): boolean {
    return this.paystack.verifyWebhookSignature(rawBody, signature);
  }

  async handlePaystackWebhook(payload: PaystackWebhookPayload) {
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
    payload: PaystackWebhookPayload,
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

    // E2-S2 criterion 3. Checked once the payment is known, so the suspicious line names the row the
    // event was aimed at, and before either branch acts, because a replayed charge.failed is as
    // damaging as a replayed charge.success. It is the one that can move money backwards.
    const freshness = assessFreshness(payload.data, new Date(), webhookMaxAgeMs());
    if (!freshness.fresh) {
      record({
        outcome: freshness.reason === "future" ? "rejected-future-dated" : "rejected-stale",
        suspicious: true,
        eventAt: freshness.eventAt,
        ageMs: freshness.ageMs,
      });
      // A second line, at warn, on purpose. The money-operation envelope closes at log level
      // because the request itself succeeded, we answered it, and an alert cannot be built on a
      // field buried inside a success line.
      this.logger.warn(
        `suspicious paystack webhook rejected: ${freshness.reason} event ${payload.event ?? "?"} for payment ${payment.id} dated ${freshness.eventAt}`,
      );
      // Still a 200. The gateway retries anything else, and this is an event we have decided never
      // to apply: retrying it forever costs both sides and changes nothing.
      return { received: true };
    }

    const success = payload.event === "charge.success" && payload.data?.status === "success";
    const failed = payload.event === "charge.failed" || payload.data?.status === "failed";

    if (success) {
      // Criterion 2. The claim inside decides; a duplicate is acknowledged with 200 and applies
      // nothing, and the outcome field is what makes that visible in the log rather than
      // indistinguishable from the delivery that did the work.
      const applied = await this.applyPaymentChargeSuccess(payment.id);
      record({ outcome: applied ? "charge-succeeded" : "duplicate-ignored" });
    } else if (failed) {
      // Conditional for the same reason the success path is. Before this, a late or replayed
      // charge.failed overwrote a SUCCEEDED payment, leaving money held in escrow against a row
      // that reads as failed.
      const marked = await this.prisma.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.SUCCEEDED } },
        data: { status: PaymentStatus.FAILED },
      });
      // Hung off the same count for the same reason. A charge.failed that arrived after the money
      // landed changed no payment and must change no transaction either, or a late delivery would
      // drag a purchase out of escrow and hand the buyer the button back with their money held.
      if (marked.count > 0) {
        await this.returnAbandonedPurchase(payment);
      }
      record({ outcome: marked.count > 0 ? "charge-failed" : "duplicate-ignored" });
    } else {
      record({ outcome: "ignored" });
    }
    return { received: true };
  }
}
