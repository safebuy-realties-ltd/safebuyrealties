import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import {
  UserRole,
  VerificationStepStatus,
  VerificationStepType,
  ListingStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { NotificationsService } from "../notifications/notifications.service";
import {
  NotificationEntityType,
  NotificationType,
} from "../notifications/notification-types.constants";
import { JwtPayload } from "../auth/jwt.strategy";
import { isInternalRole } from "../common/user-roles";
import { AssignVerificationDto } from "./dto/assign-verification.dto";
import { PatchVerificationStepDto } from "./dto/patch-verification-step.dto";
import { VERIFICATION_STEP_LABELS } from "./verification.constants";
import { RISK_FLAG_CODES } from "./risk-flags.constants";

export type VerificationStepResponse = {
  id: string;
  listingId: string;
  type: VerificationStepType;
  label: string;
  status: VerificationStepStatus;
  assignedProfessionalId?: string | null;
  notes?: string | null;
  revisionNote?: string | null;
  completedAt: string | null;
  order: number;
  riskFlags?: string[];
};

@Injectable()
export class VerificationService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private isStaff(role: UserRole) {
    return isInternalRole(role);
  }

  private async assertProfessionalVerified(professionalId: string): Promise<void> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId: professionalId },
    });
    if (!profile || profile.verifiedStatus !== "VERIFIED") {
      throw new BadRequestException(
        "Professional credentials must be verified before assignment",
      );
    }
  }

  private validateRiskFlags(flags: string[]): void {
    const allowed = new Set<string>(RISK_FLAG_CODES);
    const invalid = flags.filter((f) => !allowed.has(f));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid risk flag(s): ${invalid.join(", ")}`);
    }
  }

  private serializeStep(s: {
    id: string;
    listingId: string;
    type: VerificationStepType;
    status: VerificationStepStatus;
    assignedProfessionalId: string | null;
    notes: string | null;
    revisionNote: string | null;
    completedAt: Date | null;
    order: number;
    riskFlags: unknown;
  }): VerificationStepResponse {
    const flags = Array.isArray(s.riskFlags) ? (s.riskFlags as string[]) : [];
    return {
      id: s.id,
      listingId: s.listingId,
      type: s.type,
      label: VERIFICATION_STEP_LABELS[s.type],
      status: s.status,
      assignedProfessionalId: s.assignedProfessionalId,
      notes: s.notes,
      revisionNote: s.revisionNote,
      completedAt: s.completedAt?.toISOString() ?? null,
      order: s.order,
      riskFlags: flags,
    };
  }

  /** Public milestone view for buyers — no internal notes or assignee IDs. */
  private serializeStepForBuyer(s: {
    id: string;
    listingId: string;
    type: VerificationStepType;
    status: VerificationStepStatus;
    completedAt: Date | null;
    order: number;
  }): VerificationStepResponse {
    return {
      id: s.id,
      listingId: s.listingId,
      type: s.type,
      label: VERIFICATION_STEP_LABELS[s.type],
      status: s.status,
      completedAt: s.completedAt?.toISOString() ?? null,
      order: s.order,
    };
  }

  private serializeStepForActor(
    s: Parameters<VerificationService["serializeStep"]>[0],
    actor: JwtPayload,
  ): VerificationStepResponse {
    if (actor.role === UserRole.BUYER) {
      return this.serializeStepForBuyer(s);
    }
    return this.serializeStep(s);
  }

  async assign(dto: AssignVerificationDto, actor: JwtPayload) {
    const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
    if (!listing) throw new NotFoundException("Listing not found");

    // Seller submission path: mark the SUBMISSION step in-progress.
    if (actor.role === UserRole.SELLER) {
      if (listing.sellerId !== actor.sub) throw new ForbiddenException();
      const step = await this.prisma.verificationStep.findFirst({
        where: { listingId: dto.listingId, type: VerificationStepType.SUBMISSION },
      });
      if (!step) throw new NotFoundException("Submission step not found for this listing");
      const updated = await this.prisma.verificationStep.update({
        where: { id: step.id },
        data: {
          status:
            step.status === VerificationStepStatus.PENDING
              ? VerificationStepStatus.IN_PROGRESS
              : step.status,
        },
      });
      return this.serializeStep(updated);
    }

    if (!this.isStaff(actor.role)) throw new ForbiddenException();
    if (!dto.professionalId) throw new BadRequestException("professionalId is required");
    if (!dto.stepType) throw new BadRequestException("stepType is required");

    const pro = await this.prisma.user.findUnique({ where: { id: dto.professionalId } });
    if (!pro || pro.role !== UserRole.PROFESSIONAL) {
      throw new BadRequestException("professionalId must be a professional user");
    }
    await this.assertProfessionalVerified(dto.professionalId);

    const step = await this.prisma.verificationStep.findFirst({
      where: { listingId: dto.listingId, type: dto.stepType },
    });
    if (!step) throw new NotFoundException("Verification step not found for this listing");
    const updated = await this.prisma.verificationStep.update({
      where: { id: step.id },
      data: {
        assignedProfessionalId: dto.professionalId,
        status:
          step.status === VerificationStepStatus.PENDING
            ? VerificationStepStatus.IN_PROGRESS
            : step.status,
      },
    });
    return this.serializeStep(updated);
  }

  async getForListing(listingId: string, actor: JwtPayload) {
    await this.assertListingVerificationAccess(listingId, actor);
    const steps = await this.prisma.verificationStep.findMany({
      where: { listingId },
      orderBy: { order: "asc" },
    });
    return steps.map((s) => this.serializeStepForActor(s, actor));
  }

  private async assertListingVerificationAccess(
    listingId: string,
    actor: JwtPayload,
  ): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Listing not found");
    let allowed = this.isStaff(actor.role) || listing.sellerId === actor.sub;
    if (!allowed && actor.role === UserRole.PROFESSIONAL) {
      const n = await this.prisma.verificationStep.count({
        where: { listingId, assignedProfessionalId: actor.sub },
      });
      allowed = n > 0;
    }
    if (!allowed && actor.role === UserRole.BUYER && listing.status === ListingStatus.LIVE) {
      allowed = true;
    }
    if (!allowed) throw new ForbiddenException();
  }

  async getActivityForListing(listingId: string, actor: JwtPayload) {
    await this.assertListingVerificationAccess(listingId, actor);
    const steps = await this.prisma.verificationStep.findMany({
      where: { listingId },
      select: { id: true },
    });
    const stepIds = steps.map((s) => s.id);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: "Listing", entityId: listingId },
          ...(stepIds.length > 0
            ? [{ entity: "VerificationStep", entityId: { in: stepIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return logs.map((log) => ({
      id: log.id,
      listingId,
      stepId: log.entity === "VerificationStep" ? log.entityId : null,
      action: log.action,
      actorId: log.actorId,
      meta: (log.after as Record<string, unknown> | null) ?? null,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  async patchStep(stepId: string, dto: PatchVerificationStepDto, actor: JwtPayload) {
    const step = await this.prisma.verificationStep.findUnique({ where: { id: stepId } });
    if (!step) throw new NotFoundException("Step not found");
    const allowed = this.isStaff(actor.role) || step.assignedProfessionalId === actor.sub;
    if (!allowed) throw new ForbiddenException();
    const data: {
      status?: VerificationStepStatus;
      notes?: string | null;
      riskFlags?: string[];
      completedAt?: Date | null;
    } = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.riskFlags !== undefined) {
      this.validateRiskFlags(dto.riskFlags);
      data.riskFlags = dto.riskFlags;
    }
    if (dto.status === VerificationStepStatus.COMPLETED) {
      data.completedAt = new Date();
    }
    if (dto.status === VerificationStepStatus.PENDING) {
      data.completedAt = null;
    }
    const updated = await this.prisma.verificationStep.update({
      where: { id: stepId },
      data,
    });
    if (dto.status === VerificationStepStatus.COMPLETED) {
      void this.notifications.createForStaff({
        type: NotificationType.REPORT_SUBMITTED,
        title: "Verification report submitted",
        body: `${VERIFICATION_STEP_LABELS[step.type]} was completed and is ready for review.`,
        entityId: step.listingId,
        entityType: NotificationEntityType.Listing,
      });
    }
    return this.serializeStepForActor(updated, actor);
  }

  async acceptStep(stepId: string, actor: JwtPayload) {
    if (!this.isStaff(actor.role)) throw new ForbiddenException();
    const step = await this.prisma.verificationStep.findUnique({ where: { id: stepId } });
    if (!step) throw new NotFoundException("Step not found");
    if (step.status !== VerificationStepStatus.COMPLETED) {
      throw new BadRequestException("Only completed steps can be accepted");
    }
    const updated = await this.prisma.verificationStep.update({
      where: { id: stepId },
      data: {
        status: VerificationStepStatus.ACCEPTED,
        completedAt: new Date(),
        revisionNote: null,
      },
    });
    void this.audit.log({
      actorId: actor.sub,
      action: AuditAction.VERIFICATION_STEP_ACCEPTED,
      entity: "VerificationStep",
      entityId: stepId,
      before: { status: step.status },
      after: { status: VerificationStepStatus.ACCEPTED },
    });
    return this.serializeStep(updated);
  }

  async requestRevision(stepId: string, note: string, actor: JwtPayload) {
    if (!this.isStaff(actor.role)) throw new ForbiddenException();
    const trimmed = note?.trim();
    if (!trimmed) throw new BadRequestException("note is required");
    const step = await this.prisma.verificationStep.findUnique({ where: { id: stepId } });
    if (!step) throw new NotFoundException("Step not found");
    if (step.status !== VerificationStepStatus.COMPLETED) {
      throw new BadRequestException("Revision can only be requested for completed steps");
    }
    const updated = await this.prisma.verificationStep.update({
      where: { id: stepId },
      data: {
        status: VerificationStepStatus.REVISION_REQUESTED,
        revisionNote: trimmed,
      },
    });
    void this.audit.log({
      actorId: actor.sub,
      action: AuditAction.VERIFICATION_REVISION_REQUESTED,
      entity: "VerificationStep",
      entityId: stepId,
      before: { status: step.status, revisionNote: step.revisionNote },
      after: { status: VerificationStepStatus.REVISION_REQUESTED, revisionNote: trimmed },
    });
    if (step.assignedProfessionalId) {
      const relatedTask = await this.prisma.task.findFirst({
        where: {
          listingId: step.listingId,
          assigneeId: step.assignedProfessionalId,
          type: step.type,
        },
        select: { id: true },
      });
      void this.notifications.create({
        userId: step.assignedProfessionalId,
        type: NotificationType.REVISION_REQUESTED,
        title: "Revision requested",
        body: trimmed,
        entityId: relatedTask?.id ?? step.listingId,
        entityType: relatedTask
          ? NotificationEntityType.Task
          : NotificationEntityType.Listing,
      });
    }
    return this.serializeStep(updated);
  }
}
