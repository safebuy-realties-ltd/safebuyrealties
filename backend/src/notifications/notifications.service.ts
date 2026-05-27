import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  entityId?: string | null;
  entityType?: string | null;
};

export type NotificationDto = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  entityId: string | null;
  entityType: string | null;
  readAt: string | null;
  createdAt: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private serialize(row: {
    id: string;
    userId: string;
    type: string;
    title: string;
    body: string;
    entityId: string | null;
    entityType: string | null;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationDto {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      title: row.title,
      body: row.body,
      entityId: row.entityId,
      entityType: row.entityType,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async create(input: CreateNotificationInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          entityId: input.entityId ?? null,
          entityType: input.entityType ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to create notification (${input.type} for user ${input.userId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async createForStaff(input: Omit<CreateNotificationInput, "userId">): Promise<void> {
    try {
      const staff = await this.prisma.user.findMany({
        where: { role: { in: [UserRole.STAFF, UserRole.ADMIN] } },
        select: { id: true },
      });
      await Promise.all(staff.map((user) => this.create({ ...input, userId: user.id })));
    } catch (err) {
      this.logger.warn(
        `Failed to fan out staff notification (${input.type}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async listForUser(userId: string, page = 1, pageSize = 20) {
    const where = { userId };
    const [total, unreadCount, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      data: rows.map((row) => this.serialize(row)),
      meta: { page, pageSize, total, unreadCount },
    };
  }

  async markRead(userId: string, notificationId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!existing) throw new NotFoundException("Notification not found");

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: existing.readAt ?? new Date() },
    });
    return this.serialize(updated);
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: true };
  }
}
