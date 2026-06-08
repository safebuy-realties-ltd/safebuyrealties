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

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  private isStaff(role: UserRole) {
    return isInternalRole(role);
  }

  private serialize(tx: Prisma.TransactionGetPayload<{ include: { listing: true } }>) {
    const l = tx.listing;
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
      include: { listing: true },
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
      include: { listing: true },
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
      include: { listing: true },
    });
    return rows.map((r) => this.serialize(r));
  }

  async findOne(id: string, actor: JwtPayload) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: { listing: true },
    });
    if (!tx) throw new NotFoundException("Transaction not found");
    if (tx.buyerId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }
    return this.serialize(tx);
  }
}
