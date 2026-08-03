import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TransactionStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { DdCmsService } from "../dd-cms/dd-cms.service";
import {
  DD_ASSIGNMENT_STATUS,
  DD_ORDER_STATUS,
  type DdOrderStatus,
  allowedDdTransitions,
  canTransitionDd,
  isTerminalDdStatus,
} from "./dd-case.constants";
import { DdCaseSerializer, ddOrderInclude, type DdOrderWithRelations } from "./dd-case.serializer";

/**
 * Whether a professional may be given work, and if not, which credential is the reason.
 *
 * The gate is the same one the standalone path has always applied: the user is a professional and
 * their profile reads `VERIFIED`. What is new is the reason, which names the credential rather than
 * saying "not verified" and leaving an operations officer to open the admin screen to find out why.
 * The gate and the reason are separate on purpose. Widening the reason is safe at any time, whereas
 * widening the gate changes who can be assigned work on a path that is already live.
 */
export type DdProfessionalResolution =
  | { ok: true; professional: { id: string; firstName: string; lastName: string } }
  | { ok: false; reason: string };

export type DdAssignmentInput = {
  professionalId: string;
  scheduleCode: string;
  title?: string;
  notes?: string;
};

export type DdStatusChange = {
  status?: string;
  verdict?: string;
  staffNotes?: string;
};

/**
 * The due diligence case machinery, shared by the listing path and the standalone path.
 *
 * Every method here is a write or a read against a `DueDiligenceOrder` and nothing more. Policy
 * lives with the caller: which transitions are legal, what status code an unverified professional
 * earns, who gets notified. That division is what lets the same code serve a case an operator drives
 * from the admin queue and a case a guest bought with nothing but an email address, without either
 * one quietly inheriting the other's rules.
 */
@Injectable()
export class DdCoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ddCms: DdCmsService,
    private readonly serializer: DdCaseSerializer,
  ) {}

  /** Reads one case with every relation the serialiser needs, or 404. */
  async findOrderOrThrow(id: string): Promise<DdOrderWithRelations> {
    const order = await this.prisma.dueDiligenceOrder.findUnique({
      where: { id },
      include: ddOrderInclude,
    });
    if (!order) throw new NotFoundException("Due diligence order not found");
    return order;
  }

  /** Re-reads a case after a write, so the response reflects what was actually stored. */
  async reloadOrder(id: string, context = "after update"): Promise<DdOrderWithRelations> {
    const order = await this.prisma.dueDiligenceOrder.findUnique({
      where: { id },
      include: ddOrderInclude,
    });
    if (!order) throw new NotFoundException(`Due diligence order not found ${context}`);
    return order;
  }

  /**
   * Rejects a move that is not in `table`, with a message that says what would have been legal.
   *
   * A move to the status the case already holds is allowed through as a no-op, because a `PATCH`
   * that sets three fields and repeats the current status is an edit to the other two.
   */
  assertTransition(
    from: string,
    to: string,
    table: Readonly<Record<DdOrderStatus, readonly DdOrderStatus[]>>,
  ): void {
    if (canTransitionDd(from, to, table)) return;
    if (isTerminalDdStatus(from)) {
      throw new BadRequestException(
        `A ${from.toLowerCase()} due diligence case is final and cannot move to ${to}`,
      );
    }
    const allowed = allowedDdTransitions(from, table);
    const options = allowed.length > 0 ? allowed.join(" or ") : "nothing";
    throw new BadRequestException(
      `Cannot move a due diligence case from ${from} to ${to}. From ${from} it can only move to ${options}`,
    );
  }

  /** A case cannot be signed off without a verdict, whichever path signs it off. */
  assertVerdictOnCompletion(existingVerdict: string | null, incomingVerdict?: string): void {
    if (incomingVerdict?.trim() || existingVerdict) return;
    throw new BadRequestException("Verdict is required when completing a due diligence case");
  }

  async resolveAssignableProfessional(professionalId: string): Promise<DdProfessionalResolution> {
    const professional = await this.prisma.user.findUnique({
      where: { id: professionalId },
      include: { professionalProfile: true },
    });
    if (!professional || professional.role !== UserRole.PROFESSIONAL) {
      return { ok: false, reason: "professionalId must be a professional" };
    }

    const profile = professional.professionalProfile;
    const name = `${professional.firstName} ${professional.lastName}`.trim();
    if (profile?.verifiedStatus === "VERIFIED") {
      return {
        ok: true,
        professional: {
          id: professional.id,
          firstName: professional.firstName,
          lastName: professional.lastName,
        },
      };
    }

    return { ok: false, reason: `${name} ${this.describeMissingCredential(profile)}` };
  }

  /**
   * Names what is missing, in the words an operations officer would use chasing it.
   *
   * The order matters. A rejected profile is reported as rejected even when documents are also
   * absent, because re-uploading a document does not answer a rejection.
   */
  private describeMissingCredential(
    profile: {
      verifiedStatus: string;
      regulatoryBody: string;
      licenseNumber: string;
      licenseExpiry: Date | null;
      licenseDocumentKey: string | null;
      idDocumentKey: string | null;
      rejectionNote: string | null;
    } | null,
  ): string {
    if (!profile) {
      return "has no professional profile on record, so neither a regulatory body nor a licence number has been supplied";
    }
    if (profile.verifiedStatus === "REJECTED") {
      const note = profile.rejectionNote?.trim();
      return note
        ? `failed verification: ${note}`
        : "failed verification, and no reason was recorded against the profile";
    }

    const missing: string[] = [];
    if (!profile.regulatoryBody.trim()) missing.push("a regulatory body");
    if (!profile.licenseNumber.trim()) missing.push("a licence number");
    if (!profile.licenseDocumentKey) missing.push("a practising licence document");
    if (!profile.idDocumentKey) missing.push("an identity document");
    if (!profile.licenseExpiry) missing.push("a licence expiry date");
    if (missing.length > 0) {
      return `is not verified and the profile is still missing ${this.joinWithAnd(missing)}`;
    }

    const expired = profile.licenseExpiry && profile.licenseExpiry.getTime() < Date.now();
    if (expired) {
      return `is not verified, and licence ${profile.licenseNumber} with ${profile.regulatoryBody} expired on ${profile.licenseExpiry?.toISOString().slice(0, 10)}`;
    }
    return `is awaiting verification of licence ${profile.licenseNumber} with ${profile.regulatoryBody}`;
  }

  private joinWithAnd(parts: string[]): string {
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  }

  /**
   * Creates the assignment and moves a paid or submitted case into `IN_PROGRESS`.
   *
   * Assigning the second professional to a case already in progress leaves the status alone, which
   * is why the flip is conditional rather than unconditional.
   */
  async createAssignment(
    order: DdOrderWithRelations,
    professionalId: string,
    input: DdAssignmentInput,
  ) {
    const scheduleCode = input.scheduleCode.trim().toUpperCase();
    const title =
      input.title?.trim() ||
      `Due diligence — ${scheduleCode.replace(/_/g, " ")} (${order.serviceId ?? order.caseId ?? order.id})`;

    const assignment = await this.prisma.dueDiligenceAssignment.create({
      data: {
        dueDiligenceOrderId: order.id,
        professionalId,
        scheduleCode,
        title,
        notes: input.notes?.trim() || null,
        status: DD_ASSIGNMENT_STATUS.PENDING,
      },
    });

    if (order.status === DD_ORDER_STATUS.PAID || order.status === DD_ORDER_STATUS.SUBMITTED) {
      await this.prisma.dueDiligenceOrder.update({
        where: { id: order.id },
        data: { status: DD_ORDER_STATUS.IN_PROGRESS },
      });
      if (order.transactionId) {
        await this.prisma.transaction.update({
          where: { id: order.transactionId },
          data: { status: TransactionStatus.DD_IN_PROGRESS },
        });
      }
    }

    return assignment;
  }

  /**
   * Writes a status, a verdict and staff notes, and carries the transaction along with it.
   *
   * Each field is written only when the caller supplied it, so a `PATCH` carrying notes alone does
   * not silently blank a verdict somebody else recorded.
   */
  async applyStatusChange(order: DdOrderWithRelations, change: DdStatusChange) {
    await this.prisma.dueDiligenceOrder.update({
      where: { id: order.id },
      data: {
        ...(change.status ? { status: change.status } : {}),
        ...(change.verdict !== undefined ? { verdict: change.verdict.trim() || null } : {}),
        ...(change.staffNotes !== undefined
          ? { staffNotes: change.staffNotes.trim() || null }
          : {}),
        ...(change.status === DD_ORDER_STATUS.COMPLETE ? { completedAt: new Date() } : {}),
      },
    });

    if (order.transactionId && change.status) {
      await this.prisma.transaction.update({
        where: { id: order.transactionId },
        data: {
          status:
            change.status === DD_ORDER_STATUS.COMPLETE
              ? TransactionStatus.DD_COMPLETE
              : TransactionStatus.DD_IN_PROGRESS,
        },
      });
    }
  }

  /** Uploads an operator's report against the case and appends its key. */
  async attachOrderReport(order: DdOrderWithRelations, file: Express.Multer.File) {
    if (!file) throw new BadRequestException("Report file is required");
    const storageKey = `due-diligence/${order.id}/reports/${Date.now()}-${this.safeName(file)}`;
    await this.storage.upload(file.buffer, storageKey, file.mimetype);

    await this.prisma.dueDiligenceOrder.update({
      where: { id: order.id },
      data: {
        reportStorageKeys: [...this.reportKeys(order), storageKey] as Prisma.InputJsonValue,
      },
    });
    return storageKey;
  }

  /**
   * Uploads a professional's report against their assignment.
   *
   * The assignment and the case move together in one transaction. A report that marked the
   * assignment submitted but failed to reach the case would leave a professional believing they had
   * delivered and an operator seeing nothing to review.
   */
  async attachAssignmentReport(
    order: DdOrderWithRelations,
    assignment: { id: string },
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Report file is required");
    const storageKey = `due-diligence/${order.id}/assignments/${assignment.id}/${Date.now()}-${this.safeName(file)}`;
    await this.storage.upload(file.buffer, storageKey, file.mimetype);

    await this.prisma.$transaction([
      this.prisma.dueDiligenceAssignment.update({
        where: { id: assignment.id },
        data: {
          reportStorageKey: storageKey,
          status: DD_ASSIGNMENT_STATUS.SUBMITTED,
        },
      }),
      this.prisma.dueDiligenceOrder.update({
        where: { id: order.id },
        data: {
          reportStorageKeys: [...this.reportKeys(order), storageKey] as Prisma.InputJsonValue,
          status:
            order.status === DD_ORDER_STATUS.PAID ? DD_ORDER_STATUS.IN_PROGRESS : order.status,
        },
      }),
    ]);
    return storageKey;
  }

  private reportKeys(order: DdOrderWithRelations): string[] {
    return Array.isArray(order.reportStorageKeys) && order.reportStorageKeys.length > 0
      ? (order.reportStorageKeys as string[])
      : [];
  }

  private safeName(file: Express.Multer.File): string {
    return file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  /** Every verified professional, with the ones suited to `scheduleCode` sorted to the top. */
  async listAssignableProfessionals(scheduleCode?: string) {
    const code = scheduleCode?.trim().toUpperCase();
    const defs = code ? await this.ddCms.getActiveDefinitions() : [];
    const schedule = code ? defs.find((d) => d.code === code) : undefined;
    const suggestedTypeSet = new Set(schedule?.suggestedProfessionalTypes ?? []);
    const rows = await this.prisma.user.findMany({
      where: {
        role: UserRole.PROFESSIONAL,
        isActive: true,
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
    });
    const mapped = rows.map((row) => {
      const type = row.professionalType ?? "";
      const suggested = suggestedTypeSet.size === 0 ? false : suggestedTypeSet.has(type);
      return {
        id: row.id,
        email: row.email,
        name: `${row.firstName} ${row.lastName}`.trim(),
        professionalType: row.professionalType,
        suggested,
      };
    });
    return mapped.sort((a, b) => Number(b.suggested) - Number(a.suggested));
  }

  /** One professional's assignments, newest first, each with the case it belongs to. */
  async listAssignmentsForProfessional(professionalId: string) {
    const rows = await this.prisma.dueDiligenceAssignment.findMany({
      where: { professionalId },
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
        dueDiligenceOrder: { include: ddOrderInclude },
      },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      rows.map(async (row) => ({
        ...(await this.serializer.serializeAssignment(row)),
        order: await this.serializer.serializeOrder(row.dueDiligenceOrder),
      })),
    );
  }

  /** One assignment with its case, or null. Callers decide whether absence is a 403 or a 404. */
  async findAssignment(assignmentId: string) {
    return this.prisma.dueDiligenceAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        dueDiligenceOrder: { include: ddOrderInclude },
      },
    });
  }
}
