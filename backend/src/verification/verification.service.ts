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
import { JwtPayload } from "../auth/jwt.strategy";
import { AssignVerificationDto } from "./dto/assign-verification.dto";
import { PatchVerificationStepDto } from "./dto/patch-verification-step.dto";
import { VERIFICATION_STEP_LABELS } from "./verification.constants";

@Injectable()
export class VerificationService {
  constructor(private prisma: PrismaService) {}

  private isStaff(role: UserRole) {
    return role === UserRole.STAFF || role === UserRole.ADMIN;
  }

  private serializeStep(s: {
    id: string;
    listingId: string;
    type: VerificationStepType;
    status: VerificationStepStatus;
    assignedProfessionalId: string | null;
    notes: string | null;
    completedAt: Date | null;
    order: number;
    riskFlags: unknown;
  }) {
    const flags = Array.isArray(s.riskFlags) ? (s.riskFlags as string[]) : [];
    return {
      id: s.id,
      listingId: s.listingId,
      type: s.type,
      label: VERIFICATION_STEP_LABELS[s.type],
      status: s.status,
      assignedProfessionalId: s.assignedProfessionalId,
      notes: s.notes,
      completedAt: s.completedAt?.toISOString() ?? null,
      order: s.order,
      riskFlags: flags,
    };
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
    const steps = await this.prisma.verificationStep.findMany({
      where: { listingId },
      orderBy: { order: "asc" },
    });
    return steps.map((s) => this.serializeStep(s));
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
    if (dto.riskFlags !== undefined) data.riskFlags = dto.riskFlags;
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
    return this.serializeStep(updated);
  }
}
