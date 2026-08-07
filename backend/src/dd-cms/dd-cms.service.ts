import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DD_SCHEDULES } from "../standalone-dd/dd-schedule-checklists";
import { AuditService } from "../audit/audit.service";

export type UpsertScheduleDto = {
  code: string;
  letter: string;
  name: string;
  shortName: string;
  description: string;
  suggestedProfessionalTypes?: string[];
  sortOrder?: number;
  active?: boolean;
};

export type UpsertItemDto = {
  code: string;
  label: string;
  description?: string | null;
  sortOrder?: number;
  active?: boolean;
};

@Injectable()
export class DdCmsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async onModuleInit() {
    await this.ensureSeededFromDefaults();
  }

  async ensureSeededFromDefaults() {
    const count = await this.prisma.ddScheduleConfig.count();
    if (count > 0) return;
    for (const [index, schedule] of DD_SCHEDULES.entries()) {
      await this.prisma.ddScheduleConfig.create({
        data: {
          code: schedule.code,
          letter: schedule.letter,
          name: schedule.name,
          shortName: schedule.shortName,
          description: schedule.description,
          suggestedProfessionalTypes: schedule.suggestedProfessionalTypes,
          sortOrder: index,
          active: true,
          items: {
            create: schedule.items.map((item, itemIndex) => ({
              code: item.code,
              label: item.label,
              description: item.description ?? null,
              sortOrder: itemIndex,
              active: true,
            })),
          },
        },
      });
    }
  }

  private serializeSchedule(
    schedule: {
      id: string;
      code: string;
      letter: string;
      name: string;
      shortName: string;
      description: string;
      suggestedProfessionalTypes: string[];
      sortOrder: number;
      active: boolean;
      updatedAt: Date;
      items: {
        id: string;
        code: string;
        label: string;
        description: string | null;
        sortOrder: number;
        active: boolean;
      }[];
    },
    opts?: { includeInactiveItems?: boolean },
  ) {
    const items = (
      opts?.includeInactiveItems ? schedule.items : schedule.items.filter((i) => i.active)
    )
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        code: item.code,
        label: item.label,
        description: item.description,
        sortOrder: item.sortOrder,
        active: item.active,
      }));

    return {
      id: schedule.id,
      code: schedule.code,
      letter: schedule.letter,
      name: schedule.name,
      shortName: schedule.shortName,
      description: schedule.description,
      suggestedProfessionalTypes: schedule.suggestedProfessionalTypes,
      sortOrder: schedule.sortOrder,
      active: schedule.active,
      updatedAt: schedule.updatedAt.toISOString(),
      items,
    };
  }

  async listPublic() {
    await this.ensureSeededFromDefaults();
    const rows = await this.prisma.ddScheduleConfig.findMany({
      where: { active: true },
      include: { items: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
    return { data: rows.map((row) => this.serializeSchedule(row)) };
  }

  async listAdmin() {
    await this.ensureSeededFromDefaults();
    const rows = await this.prisma.ddScheduleConfig.findMany({
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
    return {
      data: rows.map((row) => this.serializeSchedule(row, { includeInactiveItems: true })),
    };
  }

  async createSchedule(dto: UpsertScheduleDto, actorId: string) {
    const code = dto.code.trim().toUpperCase();
    if (!/^[A-Z0-9_]+$/.test(code)) {
      throw new BadRequestException(
        "Schedule code must be uppercase letters, numbers, underscores",
      );
    }
    try {
      const created = await this.prisma.ddScheduleConfig.create({
        data: {
          code,
          letter: dto.letter.trim().toUpperCase().slice(0, 2),
          name: dto.name.trim(),
          shortName: dto.shortName.trim(),
          description: dto.description.trim(),
          suggestedProfessionalTypes: dto.suggestedProfessionalTypes ?? [],
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
        },
        include: { items: true },
      });
      await this.audit.log({
        actorId,
        action: "DD_SCHEDULE_CREATED",
        entity: "DdScheduleConfig",
        entityId: created.id,
        after: { code: created.code },
      });
      return { data: this.serializeSchedule(created, { includeInactiveItems: true }) };
    } catch {
      throw new ConflictException(`Schedule code ${code} already exists`);
    }
  }

  async updateSchedule(id: string, dto: Partial<UpsertScheduleDto>, actorId: string) {
    const existing = await this.prisma.ddScheduleConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Schedule not found");
    const updated = await this.prisma.ddScheduleConfig.update({
      where: { id },
      data: {
        ...(dto.letter !== undefined
          ? { letter: dto.letter.trim().toUpperCase().slice(0, 2) }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.shortName !== undefined ? { shortName: dto.shortName.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.suggestedProfessionalTypes !== undefined
          ? { suggestedProfessionalTypes: dto.suggestedProfessionalTypes }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    await this.audit.log({
      actorId,
      action: "DD_SCHEDULE_UPDATED",
      entity: "DdScheduleConfig",
      entityId: id,
      before: { name: existing.name, active: existing.active },
      after: { name: updated.name, active: updated.active },
    });
    return { data: this.serializeSchedule(updated, { includeInactiveItems: true }) };
  }

  async createItem(scheduleId: string, dto: UpsertItemDto, actorId: string) {
    const schedule = await this.prisma.ddScheduleConfig.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException("Schedule not found");
    const code = dto.code.trim().toUpperCase();
    if (!/^[A-Z0-9_]+$/.test(code)) {
      throw new BadRequestException("Item code must be uppercase letters, numbers, underscores");
    }
    try {
      const created = await this.prisma.ddChecklistItemConfig.create({
        data: {
          scheduleId,
          code,
          label: dto.label.trim(),
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
        },
      });
      await this.audit.log({
        actorId,
        action: "DD_CHECKLIST_ITEM_CREATED",
        entity: "DdChecklistItemConfig",
        entityId: created.id,
        after: { scheduleCode: schedule.code, code: created.code },
      });
      return {
        data: {
          id: created.id,
          code: created.code,
          label: created.label,
          description: created.description,
          sortOrder: created.sortOrder,
          active: created.active,
        },
      };
    } catch {
      throw new ConflictException(`Item code ${code} already exists on this schedule`);
    }
  }

  async updateItem(itemId: string, dto: Partial<UpsertItemDto>, actorId: string) {
    const existing = await this.prisma.ddChecklistItemConfig.findUnique({ where: { id: itemId } });
    if (!existing) throw new NotFoundException("Checklist item not found");
    const updated = await this.prisma.ddChecklistItemConfig.update({
      where: { id: itemId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: "DD_CHECKLIST_ITEM_UPDATED",
      entity: "DdChecklistItemConfig",
      entityId: itemId,
      before: { label: existing.label, active: existing.active },
      after: { label: updated.label, active: updated.active },
    });
    return {
      data: {
        id: updated.id,
        code: updated.code,
        label: updated.label,
        description: updated.description,
        sortOrder: updated.sortOrder,
        active: updated.active,
      },
    };
  }

  async reorderItems(scheduleId: string, orderedIds: string[], actorId: string) {
    const schedule = await this.prisma.ddScheduleConfig.findUnique({
      where: { id: scheduleId },
      include: { items: true },
    });
    if (!schedule) throw new NotFoundException("Schedule not found");
    const existingIds = new Set(schedule.items.map((i) => i.id));
    if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
      throw new BadRequestException("orderedIds must include every item exactly once");
    }
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.ddChecklistItemConfig.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    await this.audit.log({
      actorId,
      action: "DD_CHECKLIST_REORDERED",
      entity: "DdScheduleConfig",
      entityId: scheduleId,
      after: { orderedIds },
    });
    return this.listAdmin();
  }

  /** Active definitions for validation (codes + item codes). */
  async getActiveDefinitions() {
    await this.ensureSeededFromDefaults();
    const rows = await this.prisma.ddScheduleConfig.findMany({
      where: { active: true },
      include: { items: { where: { active: true } } },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map((row) => this.serializeSchedule(row));
  }

  async validateChecklistSelections(
    selections: Record<string, string[] | undefined>,
  ): Promise<{ ok: true; scheduleCodes: string[] } | { ok: false; message: string }> {
    const defs = await this.getActiveDefinitions();
    const byCode = new Map(defs.map((d) => [d.code, d]));
    const scheduleCodes = defs
      .map((d) => d.code)
      .filter((code) => (selections[code]?.length ?? 0) > 0);

    if (scheduleCodes.length === 0) {
      return { ok: false, message: "Select at least one checklist item under a schedule." };
    }

    for (const [code, items] of Object.entries(selections)) {
      if (!items?.length) continue;
      const schedule = byCode.get(code);
      if (!schedule) {
        return { ok: false, message: `Unknown or inactive schedule: ${code}` };
      }
      const allowed = new Set(schedule.items.map((item) => item.code));
      for (const itemCode of items) {
        if (!allowed.has(itemCode)) {
          return { ok: false, message: `Invalid checklist item ${itemCode} for ${code}` };
        }
      }
    }

    return { ok: true, scheduleCodes };
  }

  async suggestedTypesForSchedules(scheduleCodes: string[]): Promise<string[]> {
    const defs = await this.getActiveDefinitions();
    const types = new Set<string>();
    for (const code of scheduleCodes) {
      const schedule = defs.find((d) => d.code === code);
      for (const type of schedule?.suggestedProfessionalTypes ?? []) {
        types.add(type);
      }
    }
    return Array.from(types);
  }
}
