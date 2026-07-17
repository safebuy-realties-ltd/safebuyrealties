import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformConfigService } from "../platform-config/platform-config.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { CreateDdOrderDto } from "./dto/create-dd-order.dto";

type DueDiligenceOrderRow = {
  id: string;
  transactionId: string | null;
  buyerId: string;
  bundleId: string | null;
  itemIds: Prisma.JsonValue;
  subtotal: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class DueDiligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  async create(dto: CreateDdOrderDto, actor: JwtPayload) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: dto.transactionId },
    });
    if (!transaction) throw new NotFoundException("Transaction not found");
    if (transaction.buyerId !== actor.sub) {
      throw new ForbiddenException("Transaction does not belong to you");
    }

    let subtotal = new Prisma.Decimal(0);
    const itemIds = dto.itemIds ?? [];

    if (dto.bundleId) {
      const bundle = await this.prisma.serviceBundle.findUnique({
        where: { id: dto.bundleId },
      });
      if (!bundle) throw new NotFoundException(`Bundle ${dto.bundleId} not found`);
      subtotal = bundle.basePrice;
    } else if (itemIds.length > 0) {
      const items = await this.prisma.serviceCatalogItem.findMany({
        where: { id: { in: itemIds } },
      });
      if (items.length !== itemIds.length) {
        throw new BadRequestException("One or more item IDs not found");
      }
      for (const item of items) {
        subtotal = subtotal.add(item.basePrice);
      }
    } else {
      throw new BadRequestException("Provide at least one of itemIds or bundleId");
    }

    const vatRate = await this.platformConfig.getVatRate();
    const vatAmount = subtotal.mul(new Prisma.Decimal(vatRate));
    const total = subtotal.add(vatAmount);

    const data = {
      buyerId: actor.sub,
      bundleId: dto.bundleId ?? null,
      itemIds: itemIds as Prisma.InputJsonValue,
      subtotal,
      vatAmount,
      total,
      status: "PENDING",
    };

    const order = await this.prisma.dueDiligenceOrder.upsert({
      where: { transactionId: dto.transactionId },
      create: { transactionId: dto.transactionId, ...data },
      update: data,
    });

    return this.serialize(order);
  }

  private serialize(o: DueDiligenceOrderRow) {
    return {
      id: o.id,
      transactionId: o.transactionId,
      buyerId: o.buyerId,
      bundleId: o.bundleId,
      itemIds: o.itemIds,
      subtotal: o.subtotal.toFixed(2),
      vatAmount: o.vatAmount.toFixed(2),
      total: o.total.toFixed(2),
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }
}
