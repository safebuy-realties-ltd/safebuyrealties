import { Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { DdCmsService } from "../dd-cms/dd-cms.service";
import {
  type DdChecklistSelections,
  type DdScheduleCode,
} from "../standalone-dd/dd-schedule-checklists";

/**
 * The relations a due diligence case is read with, everywhere it is read.
 *
 * `listing` deliberately selects no `sellerId`. A case is readable by its buyer and, on the
 * standalone path, by a guest holding nothing but a Service ID, and neither of them has any business
 * knowing who the seller is. Code that needs the seller, such as the listing path when it notifies
 * one, looks it up separately against the listing it already holds the id of.
 */
export const ddOrderInclude = {
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
        orderBy: { createdAt: "desc" as const },
        take: 1,
      },
    },
  },
  assignments: {
    include: {
      professional: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          professionalType: true,
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.DueDiligenceOrderInclude;

export type DdOrderWithRelations = Prisma.DueDiligenceOrderGetPayload<{
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
    assignments: {
      include: {
        professional: {
          select: {
            id: true;
            email: true;
            firstName: true;
            lastName: true;
            professionalType: true;
          };
        };
      };
    };
  };
}>;

export type DdAssignmentWithProfessional = DdOrderWithRelations["assignments"][number];

/**
 * Turns a due diligence case into the shape the API returns.
 *
 * This is one class rather than two because the listing path and the standalone path return the same
 * case. They were the same case before this class existed; the difference was that only one of them
 * could be read. Splitting the serialiser would put the two responses on separate clocks and they
 * would drift within a release or two, which is the outcome this story exists to avoid.
 */
@Injectable()
export class DdCaseSerializer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ddCms: DdCmsService,
  ) {}

  async serializeOrder(order: DdOrderWithRelations) {
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
    const assignments = await Promise.all(
      (order.assignments ?? []).map((assignment) => this.serializeAssignment(assignment)),
    );
    const guestRequest = order.serviceId
      ? await this.prisma.serviceRequest.findUnique({
          where: { serviceId: order.serviceId },
          select: { guestName: true, guestEmail: true, guestPhone: true },
        })
      : null;
    const checklistSelections = await this.parseChecklistSelections(order.checklistSelections);
    const checklistSummary = await this.buildChecklistSummary(checklistSelections);
    const suggestedProfessionals = await this.buildSuggestedProfessionals(
      Object.keys(checklistSelections),
    );

    return {
      id: order.id,
      serviceId: order.serviceId,
      caseId: order.caseId,
      source: order.source,
      status: order.status,
      buyerId: order.buyerId,
      guestName: guestRequest?.guestName ?? "",
      guestEmail: guestRequest?.guestEmail ?? "",
      guestPhone: guestRequest?.guestPhone ?? "",
      bundleId: order.bundleId,
      itemIds: order.itemIds,
      checklistSelections,
      checklistSummary,
      services,
      suggestedProfessionals,
      subtotal: order.subtotal.toFixed(2),
      vatAmount: order.vatAmount.toFixed(2),
      total: order.total.toFixed(2),
      pricingNote: "Quote pending — SafeBuyRealties will confirm pricing based on selected checks.",
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
      assignments,
      property,
      listing: order.listing,
      externalProperty: order.externalProperty,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async serializeAssignment(assignment: DdAssignmentWithProfessional) {
    return {
      id: assignment.id,
      dueDiligenceOrderId: assignment.dueDiligenceOrderId,
      professionalId: assignment.professionalId,
      scheduleCode: assignment.scheduleCode,
      title: assignment.title,
      status: assignment.status,
      notes: assignment.notes,
      reportStorageKey: assignment.reportStorageKey,
      reportUrl: assignment.reportStorageKey
        ? await this.storage.getSignedUrl(assignment.reportStorageKey)
        : null,
      professional: assignment.professional
        ? {
            id: assignment.professional.id,
            email: assignment.professional.email,
            name: `${assignment.professional.firstName} ${assignment.professional.lastName}`.trim(),
            professionalType: assignment.professional.professionalType,
          }
        : null,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }

  buildPropertySummary(order: {
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

  async resolveServiceLabels(
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

  async normalizeChecklistSelections(
    raw: Record<string, string[]> | null | undefined,
  ): Promise<DdChecklistSelections> {
    const normalized: DdChecklistSelections = {};
    if (!raw || typeof raw !== "object") return normalized;
    const defs = await this.ddCms.getActiveDefinitions();
    const byCode = new Map(defs.map((d) => [d.code, d]));
    for (const [key, value] of Object.entries(raw)) {
      const schedule = byCode.get(key.trim().toUpperCase());
      if (!schedule || !Array.isArray(value)) continue;
      const allowed = new Set(schedule.items.map((item) => item.code));
      const codes = value
        .map((code) => String(code).trim().toUpperCase())
        .filter((code) => allowed.has(code));
      if (codes.length > 0) {
        normalized[schedule.code as DdScheduleCode] = Array.from(new Set(codes));
      }
    }
    return normalized;
  }

  async parseChecklistSelections(value: Prisma.JsonValue): Promise<DdChecklistSelections> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return this.normalizeChecklistSelections(value as Record<string, string[]>);
  }

  async buildChecklistSummary(selections: DdChecklistSelections) {
    const defs = await this.ddCms.getActiveDefinitions();
    return defs
      .filter((schedule) => (selections[schedule.code as DdScheduleCode]?.length ?? 0) > 0)
      .map((schedule) => ({
        code: schedule.code,
        name: schedule.name,
        shortName: schedule.shortName,
        letter: schedule.letter,
        items: (selections[schedule.code as DdScheduleCode] ?? []).map((itemCode) => {
          const item = schedule.items.find((entry) => entry.code === itemCode);
          return {
            code: itemCode,
            label: item?.label ?? itemCode,
          };
        }),
      }));
  }

  async buildSuggestedProfessionals(scheduleCodes: string[]) {
    const suggestedTypes = await this.ddCms.suggestedTypesForSchedules(scheduleCodes);
    if (suggestedTypes.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        role: UserRole.PROFESSIONAL,
        isActive: true,
        professionalType: { in: suggestedTypes as never[] },
        professionalProfile: { verifiedStatus: "VERIFIED" },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        professionalType: true,
      },
      orderBy: [{ professionalType: "asc" }, { lastName: "asc" }],
      take: 40,
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: `${row.firstName} ${row.lastName}`.trim(),
      professionalType: row.professionalType,
      suggested: true as const,
    }));
  }
}
