import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditActionType } from "./audit-actions.constants";

export type AuditLogInput = {
  actorId?: string | null;
  action: AuditActionType | string;
  entity: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          ...(input.before !== undefined ? { before: input.before } : {}),
          ...(input.after !== undefined ? { after: input.after } : {}),
          ipAddress: input.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to write audit log (${input.action} ${input.entity}:${input.entityId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
