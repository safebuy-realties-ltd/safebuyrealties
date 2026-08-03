import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ListingStatus, TransactionStatus, UserRole, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { isInternalRole } from "../common/user-roles";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import {
  PURCHASE_FACTS_INCLUDE,
  evaluatePurchaseReadiness,
  purchaseFactsFrom,
  purchaseFlagsFrom,
} from "./purchase-readiness";

/**
 * Everything every read of a transaction loads.
 *
 * E1-S4 added the last two. They travel with the listing rather than behind a second call because
 * the buyer's list is fifty rows deep and the purchase decision needs a fact off each of them, and
 * because a browser that has to ask a second question to know whether to draw a button will draw it
 * first and ask afterwards.
 */
const TRANSACTION_INCLUDE = {
  listing: true,
  ...PURCHASE_FACTS_INCLUDE,
  // Newest first, one row. This is what replaced the payment id the browser used to keep in
  // localStorage: the association between a transaction and the payment against it is a fact about
  // the transaction, and a cleared browser is not a reason to lose it.
  payments: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      id: true,
      status: true,
      intent: true,
      amount: true,
      providerReference: true,
      createdAt: true,
    },
  },
} satisfies Prisma.TransactionInclude;

type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof TRANSACTION_INCLUDE }>;

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private featureFlags: FeatureFlagsService,
  ) {}

  private isStaff(role: UserRole) {
    return isInternalRole(role);
  }

  private serialize(tx: TransactionRow) {
    const l = tx.listing;
    if (!l) {
      throw new NotFoundException("Transaction listing not found");
    }
    const latest = tx.payments[0];
    return {
      id: tx.id,
      status: tx.status,
      buyerId: tx.buyerId,
      listingId: tx.listingId,
      createdAt: tx.createdAt.toISOString(),
      updatedAt: tx.updatedAt.toISOString(),
      listing: {
        id: l.id,
        title: l.title,
        location: l.location,
        price: l.price.toString(),
        currency: l.currency,
        status: l.status,
      },
      // The same call the payments service makes before it takes money, so the button the buyer is
      // shown and the answer they get for pressing it come from one rule rather than two.
      purchase: evaluatePurchaseReadiness(
        purchaseFactsFrom(tx, purchaseFlagsFrom(this.featureFlags)),
      ),
      latestPayment: latest
        ? {
            id: latest.id,
            status: latest.status,
            intent: latest.intent,
            amount: latest.amount.toString(),
            reference: latest.providerReference,
            createdAt: latest.createdAt.toISOString(),
          }
        : null,
    };
  }

  async create(dto: CreateTransactionDto, actor: JwtPayload) {
    if (actor.role !== UserRole.BUYER) {
      throw new ForbiddenException("Only buyers can start a transaction");
    }
    const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.status === ListingStatus.UNDER_OFFER) {
      throw new ConflictException(
        "This property is currently under offer and cannot be reserved by another buyer",
      );
    }
    if (listing.status !== ListingStatus.LIVE) {
      throw new BadRequestException("Transactions can only be started on live listings");
    }
    if (listing.sellerId === actor.sub) {
      throw new BadRequestException("You cannot start a transaction on your own listing");
    }

    const open = await this.prisma.transaction.findFirst({
      where: {
        listingId: dto.listingId,
        buyerId: actor.sub,
        status: { in: [TransactionStatus.INITIATED, TransactionStatus.IN_PROGRESS] },
      },
      orderBy: { createdAt: "asc" },
      include: TRANSACTION_INCLUDE,
    });
    if (open) {
      return this.serialize(open);
    }

    const tx = await this.prisma.transaction.create({
      data: {
        listingId: dto.listingId,
        buyerId: actor.sub,
        status: TransactionStatus.INITIATED,
      },
      include: TRANSACTION_INCLUDE,
    });
    return this.serialize(tx);
  }

  async findMe(actor: JwtPayload) {
    if (actor.role !== UserRole.BUYER) {
      throw new ForbiddenException();
    }
    const rows = await this.prisma.transaction.findMany({
      where: { buyerId: actor.sub },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: TRANSACTION_INCLUDE,
    });
    return rows.map((r) => this.serialize(r));
  }

  async findOne(id: string, actor: JwtPayload) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: TRANSACTION_INCLUDE,
    });
    if (!tx) throw new NotFoundException("Transaction not found");
    if (tx.buyerId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }
    return this.serialize(tx);
  }
}
