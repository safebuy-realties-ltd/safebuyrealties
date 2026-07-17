import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ProfessionalProfile, ProfessionalType } from "@prisma/client";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { StorageService } from "../storage/storage.service";
import { PlatformConfigService } from "../platform-config/platform-config.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  NotificationEntityType,
  NotificationType,
} from "../notifications/notification-types.constants";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";
import { VerifyCredentialDto } from "./dto/verify-credential.dto";

export type ProfessionalDocumentKind = "license" | "id";

export type ProfessionalProfileResponse = {
  id: string;
  userId: string;
  regulatoryBody: string;
  licenseNumber: string;
  licenseExpiry: string | null;
  licenseDocumentKey: string | null;
  idDocumentKey: string | null;
  licenseDocumentUrl: string | null;
  idDocumentUrl: string | null;
  verifiedStatus: string;
  verifiedById: string | null;
  verifiedAt: string | null;
  rejectionNote: string | null;
  isReviewReady: boolean;
  createdAt: string;
  updatedAt: string;
};

type PendingUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  professionalType: ProfessionalType | null;
};

export type PendingCredentialResponse = ProfessionalProfileResponse & {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    professionalType: ProfessionalType | null;
  };
};

@Injectable()
export class ProfessionalsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private platformConfig: PlatformConfigService,
    private notifications: NotificationsService,
  ) {}

  async getMyProfile(userId: string): Promise<ProfessionalProfileResponse | null> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    return profile ? this.serialize(profile) : null;
  }

  async upsertMyProfile(
    userId: string,
    dto: UpdateMyProfileDto,
  ): Promise<ProfessionalProfileResponse> {
    const licenseExpiry = dto.licenseExpiry ? new Date(dto.licenseExpiry) : null;
    const data = {
      regulatoryBody: dto.regulatoryBody,
      licenseNumber: dto.licenseNumber,
      licenseExpiry,
      // Any edit resets the review state to PENDING.
      verifiedStatus: "PENDING",
      verifiedById: null,
      verifiedAt: null,
      rejectionNote: null,
    };

    const profile = await this.prisma.professionalProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.serialize(profile);
  }

  async uploadDocument(
    userId: string,
    kind: string | undefined,
    file: Express.Multer.File,
  ): Promise<ProfessionalProfileResponse> {
    if (!file?.size) throw new BadRequestException("File is required");

    const normalizedKind = this.parseDocumentKind(kind);
    const maxBytes = await this.platformConfig.getMaxUploadBytes();
    if (file.size > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      throw new ForbiddenException(`File too large (max ${maxMb}MB)`);
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = await this.storage.upload(
      file.buffer,
      path.join("professionals", userId, normalizedKind, `${Date.now()}_${safeName}`),
      file.mimetype,
    );

    const profile = await this.prisma.professionalProfile.upsert({
      where: { userId },
      create: {
        userId,
        regulatoryBody: "",
        licenseNumber: "",
        verifiedStatus: "PENDING",
        ...(normalizedKind === "license"
          ? { licenseDocumentKey: storageKey }
          : { idDocumentKey: storageKey }),
      },
      update: {
        verifiedStatus: "PENDING",
        verifiedById: null,
        verifiedAt: null,
        rejectionNote: null,
        ...(normalizedKind === "license"
          ? { licenseDocumentKey: storageKey }
          : { idDocumentKey: storageKey }),
      },
    });

    return this.serialize(profile);
  }

  async listPending(): Promise<PendingCredentialResponse[]> {
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        verifiedStatus: "PENDING",
        regulatoryBody: { not: "" },
        licenseNumber: { not: "" },
        licenseDocumentKey: { not: null },
        idDocumentKey: { not: null },
      },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            professionalType: true,
          },
        },
      },
    });

    return Promise.all(
      profiles.map(async (profile) => {
        const { user, ...rest } = profile as ProfessionalProfile & { user: PendingUser };
        return {
          ...(await this.serialize(rest)),
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            professionalType: user.professionalType,
          },
        };
      }),
    );
  }

  async verify(
    id: string,
    dto: VerifyCredentialDto,
    actorId: string,
  ): Promise<ProfessionalProfileResponse> {
    const existing = await this.prisma.professionalProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Professional profile not found");

    if (!dto.approve) {
      const note = dto.rejectionNote?.trim();
      if (!note) {
        throw new BadRequestException("rejectionNote is required when rejecting a credential");
      }
    } else if (!this.isReviewReady(existing)) {
      throw new BadRequestException(
        "Professional profile must include license details and both documents before approval",
      );
    }

    const profile = await this.prisma.professionalProfile.update({
      where: { id },
      data: {
        verifiedStatus: dto.approve ? "VERIFIED" : "REJECTED",
        verifiedById: actorId,
        verifiedAt: new Date(),
        rejectionNote: dto.approve ? null : (dto.rejectionNote?.trim() ?? null),
      },
    });
    void this.notifications.create({
      userId: profile.userId,
      type: dto.approve
        ? NotificationType.PROFESSIONAL_CREDENTIAL_VERIFIED
        : NotificationType.PROFESSIONAL_CREDENTIAL_REJECTED,
      title: dto.approve
        ? "Professional credentials approved"
        : "Professional credentials rejected",
      body: dto.approve
        ? "Your credentials have been verified. You can now be assigned to verification work."
        : (dto.rejectionNote?.trim() ?? "Please review the staff feedback and resubmit."),
      entityId: profile.id,
      entityType: NotificationEntityType.ProfessionalProfile,
    });
    void this.audit.log({
      actorId,
      action: dto.approve
        ? AuditAction.PROFESSIONAL_CREDENTIAL_VERIFIED
        : AuditAction.PROFESSIONAL_CREDENTIAL_REJECTED,
      entity: "ProfessionalProfile",
      entityId: id,
      before: { verifiedStatus: existing.verifiedStatus },
      after: {
        verifiedStatus: profile.verifiedStatus,
        rejectionNote: profile.rejectionNote,
      },
    });
    return this.serialize(profile);
  }

  private parseDocumentKind(kind: string | undefined): ProfessionalDocumentKind {
    if (kind === "license" || kind === "id") return kind;
    throw new BadRequestException("kind must be 'license' or 'id'");
  }

  private isReviewReady(profile: Pick<
    ProfessionalProfile,
    "regulatoryBody" | "licenseNumber" | "licenseDocumentKey" | "idDocumentKey"
  >): boolean {
    return Boolean(
      profile.regulatoryBody.trim() &&
        profile.licenseNumber.trim() &&
        profile.licenseDocumentKey &&
        profile.idDocumentKey,
    );
  }

  private async serialize(profile: ProfessionalProfile): Promise<ProfessionalProfileResponse> {
    const [licenseDocumentUrl, idDocumentUrl] = await Promise.all([
      profile.licenseDocumentKey ? this.storage.getSignedUrl(profile.licenseDocumentKey) : null,
      profile.idDocumentKey ? this.storage.getSignedUrl(profile.idDocumentKey) : null,
    ]);
    return {
      id: profile.id,
      userId: profile.userId,
      regulatoryBody: profile.regulatoryBody,
      licenseNumber: profile.licenseNumber,
      licenseExpiry: profile.licenseExpiry?.toISOString() ?? null,
      licenseDocumentKey: profile.licenseDocumentKey,
      idDocumentKey: profile.idDocumentKey,
      licenseDocumentUrl,
      idDocumentUrl,
      verifiedStatus: profile.verifiedStatus,
      verifiedById: profile.verifiedById,
      verifiedAt: profile.verifiedAt?.toISOString() ?? null,
      rejectionNote: profile.rejectionNote,
      isReviewReady: this.isReviewReady(profile),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
