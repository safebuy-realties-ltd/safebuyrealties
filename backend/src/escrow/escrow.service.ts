import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  ListingStatus,
  Prisma,
  TransactionStatus,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  NotificationEntityType,
  NotificationType,
} from "../notifications/notification-types.constants";
import { JwtPayload } from "../auth/jwt.strategy";
import { isInternalRole } from "../common/user-roles";
import { PaystackService } from "../payments/paystack.service";
import { MOCK_REFERENCE_PREFIX, isMockReference } from "../config/payments-guard";
import { MoneyFields, withMoneyOperation } from "../common/logging/money-operation";
import {
  DEFAULT_RELEASE_CONDITIONS,
  ESCROW_STATUS,
  PAYOUT_STATUS,
  PLATFORM_FEE_RATE,
  ReleaseCondition,
} from "./escrow.constants";

type EscrowRow = Prisma.EscrowGetPayload<{
  include: {
    transaction: {
      include: {
        listing: { select: { id: true; title: true; sellerId: true; status: true } };
        buyer: { select: { id: true; firstName: true; lastName: true; email: true } };
      };
    };
  };
}>;

@Injectable()
export class EscrowService {
  /** See PaymentsService: resolved through the structured logger, so lines carry the request id. */
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly paystack: PaystackService,
  ) {}

  private isStaff(role: UserRole) {
    return isInternalRole(role);
  }

  private requireListing(listing: EscrowRow["transaction"]["listing"] | null) {
    if (!listing) {
      throw new NotFoundException("Escrow transaction listing not found");
    }
    return listing;
  }

  private serializeEscrow(row: EscrowRow, unmetConditions: ReleaseCondition[] = []) {
    const listing = this.requireListing(row.transaction.listing);
    return {
      id: row.id,
      transactionId: row.transactionId,
      status: row.status,
      heldAmount: row.heldAmount.toString(),
      releaseConditions: row.releaseConditions,
      conditionsMet: row.conditionsMet,
      heldAt: row.heldAt?.toISOString() ?? null,
      releasedAt: row.releasedAt?.toISOString() ?? null,
      refundedAt: row.refundedAt?.toISOString() ?? null,
      releasedById: row.releasedById,
      releaseNote: row.releaseNote,
      unmetConditions,
      transaction: {
        id: row.transaction.id,
        status: row.transaction.status,
        buyerId: row.transaction.buyerId,
        listingId: row.transaction.listingId,
        listing: {
          id: listing.id,
          title: listing.title,
          sellerId: listing.sellerId,
          status: listing.status,
        },
        buyer: {
          id: row.transaction.buyer.id,
          name: `${row.transaction.buyer.firstName} ${row.transaction.buyer.lastName}`.trim(),
          email: row.transaction.buyer.email,
        },
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializePayout(p: {
    id: string;
    transactionId: string;
    sellerId: string;
    grossAmount: Prisma.Decimal;
    platformFee: Prisma.Decimal;
    netAmount: Prisma.Decimal;
    status: string;
    gatewayReference: string | null;
    initiatedAt: Date | null;
    completedAt: Date | null;
  }) {
    return {
      id: p.id,
      transactionId: p.transactionId,
      sellerId: p.sellerId,
      grossAmount: p.grossAmount.toString(),
      platformFee: p.platformFee.toString(),
      netAmount: p.netAmount.toString(),
      status: p.status,
      gatewayReference: p.gatewayReference,
      // Derived from the reference prefix rather than a stored column. A mock payout is
      // recorded as COMPLETED without money moving, so operators must be able to see it.
      isMock: isMockReference(p.gatewayReference),
      initiatedAt: p.initiatedAt?.toISOString() ?? null,
      completedAt: p.completedAt?.toISOString() ?? null,
    };
  }

  private escrowInclude() {
    return {
      transaction: {
        include: {
          listing: { select: { id: true, title: true, sellerId: true, status: true } },
          buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    } satisfies Prisma.EscrowInclude;
  }

  async hold(transactionId: string, amount: Prisma.Decimal | number | string) {
    return withMoneyOperation(
      this.logger,
      "escrow.hold",
      {
        transactionId,
        amount: String(amount),
        amountMinor: Math.round(Number(amount) * 100),
        currency: "NGN",
      },
      (record) => this.holdFunds(transactionId, amount, record),
    );
  }

  private async holdFunds(
    transactionId: string,
    amount: Prisma.Decimal | number | string,
    record: (extra: MoneyFields) => void,
  ) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { listing: true },
    });
    if (!tx) throw new NotFoundException("Transaction not found");

    const heldAmount = new Prisma.Decimal(amount);
    const now = new Date();

    const row = await this.prisma.escrow.upsert({
      where: { transactionId },
      create: {
        transactionId,
        status: ESCROW_STATUS.HELD,
        heldAmount,
        releaseConditions: DEFAULT_RELEASE_CONDITIONS as unknown as Prisma.InputJsonValue,
        conditionsMet: [] as unknown as Prisma.InputJsonValue,
        heldAt: now,
      },
      update: {
        status: ESCROW_STATUS.HELD,
        heldAmount,
        heldAt: now,
      },
      include: this.escrowInclude(),
    });

    record({ escrowId: row.id, subjectUserId: tx.listing?.sellerId });

    return this.serializeEscrow(row, await this.checkConditions(transactionId));
  }

  async checkConditions(transactionId: string): Promise<ReleaseCondition[]> {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { listing: true, powerOfAttorney: true },
    });
    if (!tx) throw new NotFoundException("Transaction not found");

    const unmet: ReleaseCondition[] = [];
    const ddCompleteStatuses: TransactionStatus[] = [
      TransactionStatus.DD_COMPLETE,
      TransactionStatus.PURCHASE_PENDING,
      TransactionStatus.PURCHASE_IN_ESCROW,
      TransactionStatus.COMPLETED,
    ];
    if (!ddCompleteStatuses.includes(tx.status)) {
      unmet.push(
        DEFAULT_RELEASE_CONDITIONS.find((c) => c.code === "DD_COMPLETE") ?? {
          code: "DD_COMPLETE",
          label: "Due diligence complete",
        },
      );
    }

    if (!tx.powerOfAttorney) {
      unmet.push(
        DEFAULT_RELEASE_CONDITIONS.find((c) => c.code === "POA_EXECUTED") ?? {
          code: "POA_EXECUTED",
          label: "Power of Attorney executed",
        },
      );
    }

    const reservedStatuses: ListingStatus[] = [ListingStatus.UNDER_OFFER, ListingStatus.SOLD];
    if (!tx.listing || !reservedStatuses.includes(tx.listing.status as ListingStatus)) {
      unmet.push(
        DEFAULT_RELEASE_CONDITIONS.find((c) => c.code === "PROPERTY_RESERVED") ?? {
          code: "PROPERTY_RESERVED",
          label: "Property reserved under offer",
        },
      );
    }

    return unmet;
  }

  private async assertCanViewEscrow(transactionId: string, actor: JwtPayload) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { listing: true },
    });
    if (!tx) throw new NotFoundException("Transaction not found");
    if (this.isStaff(actor.role)) return tx;
    if (tx.buyerId === actor.sub) return tx;
    if (tx.listing?.sellerId === actor.sub) return tx;
    throw new ForbiddenException();
  }

  async findByTransactionId(transactionId: string, actor: JwtPayload) {
    await this.assertCanViewEscrow(transactionId, actor);
    const row = await this.prisma.escrow.findUnique({
      where: { transactionId },
      include: this.escrowInclude(),
    });
    if (!row) throw new NotFoundException("Escrow not found for this transaction");
    const unmet = await this.checkConditions(transactionId);
    return this.serializeEscrow(row, unmet);
  }

  async listHeld(actor: JwtPayload) {
    if (!this.isStaff(actor.role)) {
      throw new ForbiddenException("Only staff can list held escrows");
    }
    const rows = await this.prisma.escrow.findMany({
      where: { status: ESCROW_STATUS.HELD },
      orderBy: { heldAt: "desc" },
      include: this.escrowInclude(),
    });
    return Promise.all(
      rows.map(async (row) => this.serializeEscrow(row, await this.checkConditions(row.transactionId))),
    );
  }

  async release(transactionId: string, staffId: string, note?: string) {
    return withMoneyOperation(
      this.logger,
      "escrow.release",
      { transactionId, releasedById: staffId },
      (record) => this.releaseFunds(transactionId, staffId, record, note),
    );
  }

  private async releaseFunds(
    transactionId: string,
    staffId: string,
    record: (extra: MoneyFields) => void,
    note?: string,
  ) {
    const unmet = await this.checkConditions(transactionId);
    if (unmet.length > 0) {
      throw new BadRequestException({
        message: "Release conditions are not met",
        unmetConditions: unmet,
      });
    }

    const existing = await this.prisma.escrow.findUnique({ where: { transactionId } });
    if (!existing) throw new NotFoundException("Escrow not found for this transaction");
    if (existing.status !== ESCROW_STATUS.HELD) {
      throw new BadRequestException(`Escrow cannot be released from status ${existing.status}`);
    }
    record({
      escrowId: existing.id,
      amount: existing.heldAmount.toString(),
      amountMinor: Math.round(Number(existing.heldAmount) * 100),
      currency: "NGN",
    });

    const metCodes = DEFAULT_RELEASE_CONDITIONS.map((c) => c.code);
    const now = new Date();

    const row = await this.prisma.$transaction(async (db) => {
      const updated = await db.escrow.update({
        where: { transactionId },
        data: {
          status: ESCROW_STATUS.RELEASED,
          releasedAt: now,
          releasedById: staffId,
          releaseNote: note ?? null,
          conditionsMet: metCodes as unknown as Prisma.InputJsonValue,
        },
        include: this.escrowInclude(),
      });

      await db.transaction.update({
        where: { id: transactionId },
        data: { status: TransactionStatus.COMPLETED },
      });

      if (updated.transaction.listingId) {
        await db.listing.updateMany({
          where: { id: updated.transaction.listingId, status: ListingStatus.UNDER_OFFER },
          data: { status: ListingStatus.SOLD },
        });
      }

      return updated;
    });

    const payout = await this.initiatePayout(transactionId);
    record({ payoutId: payout.id, payoutStatus: payout.status });

    await this.audit.log({
      actorId: staffId,
      action: "ESCROW_RELEASED",
      entity: "Escrow",
      entityId: row.id,
      after: { transactionId, payoutId: payout.id },
    });
    this.notifyEscrowParties(row, NotificationType.ESCROW_RELEASED);

    return { escrow: this.serializeEscrow(row, []), payout };
  }

  async refund(transactionId: string, staffId: string, note?: string) {
    return withMoneyOperation(
      this.logger,
      "escrow.refund",
      { transactionId, releasedById: staffId },
      (record) => this.refundFunds(transactionId, staffId, record, note),
    );
  }

  private async refundFunds(
    transactionId: string,
    staffId: string,
    record: (extra: MoneyFields) => void,
    note?: string,
  ) {
    const existing = await this.prisma.escrow.findUnique({
      where: { transactionId },
      include: { transaction: { include: { listing: true } } },
    });
    if (!existing) throw new NotFoundException("Escrow not found for this transaction");
    if (existing.status !== ESCROW_STATUS.HELD) {
      throw new BadRequestException(`Escrow cannot be refunded from status ${existing.status}`);
    }
    record({
      escrowId: existing.id,
      amount: existing.heldAmount.toString(),
      amountMinor: Math.round(Number(existing.heldAmount) * 100),
      currency: "NGN",
      subjectUserId: existing.transaction.buyerId,
    });

    const now = new Date();
    const row = await this.prisma.$transaction(async (db) => {
      const updated = await db.escrow.update({
        where: { transactionId },
        data: {
          status: ESCROW_STATUS.REFUNDED,
          refundedAt: now,
          releasedById: staffId,
          releaseNote: note ?? null,
        },
        include: this.escrowInclude(),
      });

      if (existing.transaction.listingId) {
        await db.listing.update({
          where: { id: existing.transaction.listingId },
          data: { status: ListingStatus.VERIFIED },
        });
      }

      return updated;
    });

    await this.audit.log({
      actorId: staffId,
      action: "ESCROW_REFUNDED",
      entity: "Escrow",
      entityId: row.id,
      after: { transactionId, note: note ?? null },
    });
    this.notifyEscrowParties(row, NotificationType.ESCROW_REFUNDED);

    return this.serializeEscrow(row, await this.checkConditions(transactionId));
  }

  async initiatePayout(transactionId: string) {
    return withMoneyOperation(
      this.logger,
      "payout.initiate",
      { transactionId, currency: "NGN" },
      (record) => this.createPayout(transactionId, record),
    );
  }

  private async createPayout(transactionId: string, record: (extra: MoneyFields) => void) {
    const escrow = await this.prisma.escrow.findUnique({
      where: { transactionId },
      include: { transaction: { include: { listing: true } } },
    });
    if (!escrow) throw new NotFoundException("Escrow not found for this transaction");

    const existing = await this.prisma.payout.findFirst({
      where: { transactionId, status: { not: PAYOUT_STATUS.FAILED } },
    });
    if (existing) {
      // Idempotent re-entry, not a second payment. Logged as such, because two `payout.initiate`
      // starts for one transaction would otherwise read as double-paying a seller.
      record({
        payoutId: existing.id,
        outcome: "already-initiated",
        payoutStatus: existing.status,
        amount: existing.netAmount.toString(),
        amountMinor: Math.round(Number(existing.netAmount) * 100),
      });
      return this.serializePayout(existing);
    }

    const gross = escrow.heldAmount;
    const platformFee = gross.mul(PLATFORM_FEE_RATE);
    const netAmount = gross.sub(platformFee);
    const listing = escrow.transaction.listing;
    if (!listing) {
      throw new NotFoundException("Escrow transaction listing not found");
    }
    const sellerId = listing.sellerId;
    const now = new Date();

    record({
      escrowId: escrow.id,
      subjectUserId: sellerId,
      grossAmountMinor: Math.round(Number(gross) * 100),
      platformFeeMinor: Math.round(Number(platformFee) * 100),
      amount: netAmount.toString(),
      amountMinor: Math.round(Number(netAmount) * 100),
    });

    const settlement = await this.settleWithProvider(
      { transactionId, sellerId, netAmount, now },
      record,
    );
    record({ payoutStatus: settlement.status, reference: settlement.gatewayReference ?? undefined });

    const payout = await this.prisma.payout.create({
      data: {
        transactionId,
        sellerId,
        grossAmount: gross,
        platformFee,
        netAmount,
        ...settlement,
      },
    });

    record({ payoutId: payout.id });
    return this.serializePayout(payout);
  }

  /**
   * Asks the provider to move the money and reports what came back. Extracted from `createPayout`
   * so that the money maths, the provider call and the row write are three readable things rather
   * than one long one.
   */
  private async settleWithProvider(
    input: { transactionId: string; sellerId: string; netAmount: Prisma.Decimal; now: Date },
    record: (extra: MoneyFields) => void,
  ): Promise<{
    status: string;
    gatewayReference: string | null;
    initiatedAt: Date | null;
    completedAt: Date | null;
  }> {
    const { transactionId, sellerId, netAmount, now } = input;

    if (!this.paystack.isConfigured()) {
      record({ mock: true });
      return {
        status: PAYOUT_STATUS.COMPLETED,
        gatewayReference: `${MOCK_REFERENCE_PREFIX}transfer_${transactionId.slice(0, 8)}`,
        initiatedAt: now,
        completedAt: now,
      };
    }

    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { firstName: true, lastName: true },
    });
    const sellerName = seller ? `${seller.firstName} ${seller.lastName}`.trim() : "Seller payout";

    try {
      const transfer = await this.paystack.createTransfer({
        amountMinor: Math.round(Number(netAmount) * 100),
        recipientName: sellerName,
        reason: `Escrow payout for transaction ${transactionId.slice(0, 8)}`,
        reference: `sbr_payout_${transactionId.slice(0, 12)}`,
      });
      const completed = transfer.status === "success";
      return {
        status: completed ? PAYOUT_STATUS.COMPLETED : PAYOUT_STATUS.INITIATED,
        gatewayReference: transfer.reference,
        initiatedAt: now,
        completedAt: completed ? now : null,
      };
    } catch (cause) {
      // The row records that it failed; only the log records why. Before this the provider's
      // reason was swallowed here and a seller's payout failed silently.
      record({ transferError: cause instanceof Error ? cause.message : String(cause) });
      return {
        status: PAYOUT_STATUS.FAILED,
        gatewayReference: `transfer_failed_${transactionId.slice(0, 8)}`,
        initiatedAt: now,
        completedAt: null,
      };
    }
  }

  private notifyEscrowParties(
    row: EscrowRow,
    type:
      | typeof NotificationType.ESCROW_RELEASED
      | typeof NotificationType.ESCROW_REFUNDED,
  ) {
    const listing = this.requireListing(row.transaction.listing);
    const listingTitle = listing.title;
    const buyerId = row.transaction.buyer.id;
    const sellerId = listing.sellerId;
    const entityId = row.transactionId;
    const entityType = NotificationEntityType.Transaction;

    if (type === NotificationType.ESCROW_RELEASED) {
      void this.notifications.create({
        userId: buyerId,
        type: NotificationType.ESCROW_RELEASED,
        title: "Escrow released",
        body: `Funds held in escrow for "${listingTitle}" have been released to complete your purchase.`,
        entityId,
        entityType,
      });
      void this.notifications.create({
        userId: sellerId,
        type: NotificationType.ESCROW_RELEASED,
        title: "Escrow released",
        body: `Escrow funds for "${listingTitle}" have been released. Your payout is being processed.`,
        entityId,
        entityType,
      });
      return;
    }

    void this.notifications.create({
      userId: buyerId,
      type: NotificationType.ESCROW_REFUNDED,
      title: "Escrow refunded",
      body: `Your escrow funds for "${listingTitle}" have been refunded.`,
      entityId,
      entityType,
    });
    void this.notifications.create({
      userId: sellerId,
      type: NotificationType.ESCROW_REFUNDED,
      title: "Escrow refunded",
      body: `The escrow hold for "${listingTitle}" was refunded to the buyer.`,
      entityId,
      entityType,
    });
  }
}
