import { Injectable, OnModuleInit, NotFoundException, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformConfigService } from "../platform-config/platform-config.service";

const DD_CHECK_ITEMS = [
  {
    code: "LEGAL_CHECK",
    name: "Legal Check",
    description: "Legal title and documentation review for the property.",
    basePrice: new Prisma.Decimal(350000),
    sortOrder: 101,
  },
  {
    code: "PHYSICAL_CHECK",
    name: "Physical Check",
    description: "On-site physical inspection of structures and boundaries.",
    basePrice: new Prisma.Decimal(275000),
    sortOrder: 102,
  },
  {
    code: "ENVIRONMENTAL_CHECK",
    name: "Environmental Check",
    description: "Environmental and drainage risk assessment.",
    basePrice: new Prisma.Decimal(225000),
    sortOrder: 103,
  },
  {
    code: "SECURITY_CHECK",
    name: "Security Check",
    description: "Neighbourhood security and access route assessment.",
    basePrice: new Prisma.Decimal(175000),
    sortOrder: 104,
  },
];

const CATALOG_ITEMS = [
  { code: "DUE_DILIGENCE",        name: "Due Diligence",           sortOrder: 1 },
  { code: "LAND_CHARTING_SEARCH", name: "Land/Charting Search",    sortOrder: 2 },
  { code: "COF_O",                name: "Certificate of Occupancy",sortOrder: 3 },
  { code: "TITLE_VERIFICATION",   name: "Title Verification",      sortOrder: 4 },
  { code: "SURVEY_PLAN",          name: "Survey Plan",             sortOrder: 5 },
  { code: "EXCISION",             name: "Excision",                sortOrder: 6 },
  { code: "GAZETTE",              name: "Gazette",                 sortOrder: 7 },
  { code: "DEED_OF_ASSIGNMENT",   name: "Deed of Assignment",      sortOrder: 8 },
  { code: "GOVERNORS_CONSENT",    name: "Governor's Consent",      sortOrder: 9 },
  { code: "TITLE_PERFECTION",     name: "Title Perfection",        sortOrder: 10 },
  { code: "DOCUMENTATION_AUDIT",  name: "Documentation Audit",     sortOrder: 11 },
  { code: "VALUATION",            name: "Valuation",               sortOrder: 12 },
  { code: "RISK_ASSESSMENT",      name: "Risk Assessment",         sortOrder: 13 },
  { code: "DISPUTE_ADVISORY",     name: "Dispute Advisory",        sortOrder: 14 },
  { code: "TRANSACTION_ADVISORY", name: "Transaction Advisory",    sortOrder: 15 },
];

const BUNDLES = [
  {
    code: "STANDARD",
    name: "Standard Bundle",
    description: "Essential property verification services covering due diligence, land search, C of O, title verification, and survey plan.",
    basePrice: new Prisma.Decimal(2950000),
    itemSortOrders: [1, 2, 3, 4, 5],
  },
  {
    code: "PREMIUM",
    name: "Premium Bundle",
    description: "Comprehensive property verification including all standard services plus excision, gazette, deed, governor's consent, and title perfection.",
    basePrice: new Prisma.Decimal(4200000),
    itemSortOrders: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  {
    code: "ELITE",
    name: "Elite Bundle",
    description: "Full-suite property verification and advisory covering all 15 services including documentation audit, valuation, risk assessment, and dispute advisory.",
    basePrice: new Prisma.Decimal(5850000),
    itemSortOrders: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  },
];

export interface CalculateResult {
  subtotal: string;
  vat: string;
  total: string;
}

export interface UpdateItemDto {
  name?: string;
  description?: string;
  basePrice?: number | string;
  active?: boolean;
}

@Injectable()
export class ServiceCatalogService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.prisma.serviceCatalogItem.count();
    if (count === 0) {
      // Seed items
      for (const item of CATALOG_ITEMS) {
        await this.prisma.serviceCatalogItem.create({
          data: {
            code: item.code,
            name: item.name,
            description: `Professional ${item.name} service for property verification and documentation.`,
            basePrice: new Prisma.Decimal(150000),
            sortOrder: item.sortOrder,
          },
        });
      }

      // Seed bundles
      for (const bundle of BUNDLES) {
        const items = await this.prisma.serviceCatalogItem.findMany({
          where: { sortOrder: { in: bundle.itemSortOrders } },
          select: { id: true },
        });

        await this.prisma.serviceBundle.create({
          data: {
            code: bundle.code,
            name: bundle.name,
            description: bundle.description,
            basePrice: bundle.basePrice,
            items: {
              create: items.map((item) => ({ itemId: item.id })),
            },
          },
        });
      }
    }

    for (const item of DD_CHECK_ITEMS) {
      await this.prisma.serviceCatalogItem.upsert({
        where: { code: item.code },
        create: item,
        update: {},
      });
    }
  }

  async getItems() {
    return this.prisma.serviceCatalogItem.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getBundles() {
    const bundles = await this.prisma.serviceBundle.findMany({
      where: { active: true },
      include: {
        items: {
          include: {
            item: {
              select: {
                id: true,
                code: true,
                name: true,
                description: true,
                basePrice: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return bundles.map((bundle) => ({
      id: bundle.id,
      code: bundle.code,
      name: bundle.name,
      description: bundle.description,
      basePrice: bundle.basePrice,
      active: bundle.active,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
      items: bundle.items.map((bi) => bi.item),
    }));
  }

  async calculate(itemIds?: string[], bundleId?: string): Promise<CalculateResult> {
    let subtotal = new Prisma.Decimal(0);

    if (bundleId) {
      // bundleId takes precedence
      const bundle = await this.prisma.serviceBundle.findUnique({
        where: { id: bundleId },
      });
      if (!bundle) throw new NotFoundException(`Bundle ${bundleId} not found`);
      subtotal = bundle.basePrice;
    } else if (itemIds && itemIds.length > 0) {
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
    const vat = subtotal.mul(new Prisma.Decimal(vatRate));
    const total = subtotal.add(vat);

    return {
      subtotal: subtotal.toFixed(2),
      vat: vat.toFixed(2),
      total: total.toFixed(2),
    };
  }

  async updateItem(id: string, dto: UpdateItemDto) {
    const existing = await this.prisma.serviceCatalogItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Service catalog item ${id} not found`);

    return this.prisma.serviceCatalogItem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.basePrice !== undefined ? { basePrice: new Prisma.Decimal(dto.basePrice) } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }
}
