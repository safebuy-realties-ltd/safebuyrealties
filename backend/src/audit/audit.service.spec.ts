import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { AuditAction } from "./audit-actions.constants";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  let service: AuditService;
  let prisma: { auditLog: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AuditService);
  });

  it("persists an audit log row with before/after payloads", async () => {
    await service.log({
      actorId: "staff-1",
      action: AuditAction.LISTING_STATUS_CHANGED,
      entity: "Listing",
      entityId: "listing-1",
      before: { status: "PENDING_REVIEW" },
      after: { status: "ASSIGNED" },
      ipAddress: "127.0.0.1",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: "staff-1",
        action: AuditAction.LISTING_STATUS_CHANGED,
        entity: "Listing",
        entityId: "listing-1",
        before: { status: "PENDING_REVIEW" },
        after: { status: "ASSIGNED" },
        ipAddress: "127.0.0.1",
      },
    });
  });

  it("does not throw when persistence fails", async () => {
    prisma.auditLog.create.mockRejectedValue(new Error("db down"));

    await expect(
      service.log({
        action: AuditAction.TASK_CREATED,
        entity: "Task",
        entityId: "task-1",
      }),
    ).resolves.toBeUndefined();
  });
});
