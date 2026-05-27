import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationType } from "./notification-types.constants";
import { NotificationsService } from "./notifications.service";

describe("NotificationsService", () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn().mockResolvedValue({ id: "n-1" }),
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: "staff-1" }, { id: "admin-1" }]),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(NotificationsService);
  });

  it("persists a notification row", async () => {
    await service.create({
      userId: "user-1",
      type: NotificationType.LISTING_SUBMITTED,
      title: "New listing",
      body: "A seller submitted a listing for review.",
      entityId: "listing-1",
      entityType: "Listing",
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        type: NotificationType.LISTING_SUBMITTED,
        title: "New listing",
        body: "A seller submitted a listing for review.",
        entityId: "listing-1",
        entityType: "Listing",
      },
    });
  });

  it("does not throw when create fails", async () => {
    prisma.notification.create.mockRejectedValue(new Error("db down"));

    await expect(
      service.create({
        userId: "user-1",
        type: NotificationType.TASK_ASSIGNED,
        title: "Task",
        body: "You have a new task.",
      }),
    ).resolves.toBeUndefined();
  });

  it("fans out notifications to staff and admin users", async () => {
    const createSpy = jest.spyOn(service, "create").mockResolvedValue(undefined);

    await service.createForStaff({
      type: NotificationType.REPORT_SUBMITTED,
      title: "Report submitted",
      body: "A professional submitted a report.",
      entityId: "listing-1",
      entityType: "Listing",
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: { in: [UserRole.STAFF, UserRole.ADMIN] } },
      select: { id: true },
    });
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "staff-1" }),
    );
  });

  it("returns paginated notifications with unread count", async () => {
    const row = {
      id: "n-1",
      userId: "user-1",
      type: NotificationType.LISTING_VERIFIED,
      title: "Verified",
      body: "Your listing was verified.",
      entityId: "listing-1",
      entityType: "Listing",
      readAt: null,
      createdAt: new Date("2026-05-27T10:00:00.000Z"),
    };
    prisma.$transaction.mockResolvedValue([1, 1, [row]]);

    const result = await service.listForUser("user-1", 1, 10);

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 10, total: 1, unreadCount: 1 });
    expect(result.data[0].createdAt).toBe("2026-05-27T10:00:00.000Z");
  });

  it("marks a notification as read", async () => {
    prisma.notification.findFirst.mockResolvedValue({
      id: "n-1",
      userId: "user-1",
      readAt: null,
    });
    prisma.notification.update.mockResolvedValue({
      id: "n-1",
      userId: "user-1",
      type: NotificationType.TASK_ASSIGNED,
      title: "Task",
      body: "Assigned",
      entityId: "task-1",
      entityType: "Task",
      readAt: new Date("2026-05-27T11:00:00.000Z"),
      createdAt: new Date("2026-05-27T10:00:00.000Z"),
    });

    const result = await service.markRead("user-1", "n-1");

    expect(result.readAt).toBe("2026-05-27T11:00:00.000Z");
  });

  it("marks all unread notifications as read", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.markAllRead("user-1")).resolves.toEqual({ updated: true });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
