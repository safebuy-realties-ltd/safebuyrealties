import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { KycRecord } from "@prisma/client";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PlatformConfigService } from "../platform-config/platform-config.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notification-types.constants";
import { KycStatus } from "./kyc.constants";
import { SubmitKycDto } from "./dto/submit-kyc.dto";

export type KycRecordResponse = {
  id: string | null;
  userId: string;
  status: string;
  documentKeys: string[];
  reviewerId: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type KycDocumentLink = {
  storageKey: string;
  url: string;
};

export type KycQueueItem = KycRecordResponse & {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  documents: KycDocumentLink[];
};

@Injectable()
export class KycService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private platformConfig: PlatformConfigService,
    private notifications: NotificationsService,
  ) {}

  async getMy(userId: string): Promise<KycRecordResponse> {
    const record = await this.prisma.kycRecord.findUnique({ where: { userId } });
    return record ? this.serialize(record) : this.emptyRecord(userId);
  }

  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ storageKey: string; url: string }> {
    if (!file?.size) throw new BadRequestException("File is required");

    const maxBytes = await this.platformConfig.getMaxUploadBytes();
    if (file.size > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      throw new ForbiddenException(`File too large (max ${maxMb}MB)`);
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = await this.storage.upload(
      file.buffer,
      path.join("kyc", userId, `${Date.now()}_${safeName}`),
      file.mimetype,
    );
    const url = await this.storage.getSignedUrl(storageKey);
    return { storageKey, url };
  }

  async submit(userId: string, dto: SubmitKycDto): Promise<KycRecordResponse> {
    this.assertDocumentKeysOwnedByUser(userId, dto.documentKeys);

    const existing = await this.prisma.kycRecord.findUnique({ where: { userId } });
    if (
      existing &&
      existing.status !== KycStatus.NOT_SUBMITTED &&
      existing.status !== KycStatus.REJECTED
    ) {
      throw new BadRequestException("KYC cannot be submitted in the current status");
    }

    const now = new Date();
    const record = await this.prisma.kycRecord.upsert({
      where: { userId },
      create: {
        userId,
        status: KycStatus.SUBMITTED,
        documentKeys: dto.documentKeys,
        submittedAt: now,
      },
      update: {
        status: KycStatus.SUBMITTED,
        documentKeys: dto.documentKeys,
        reviewerId: null,
        reviewNote: null,
        reviewedAt: null,
        submittedAt: now,
      },
    });
    return this.serialize(record);
  }

  async listQueue(): Promise<KycQueueItem[]> {
    const records = await this.prisma.kycRecord.findMany({
      where: { status: KycStatus.SUBMITTED },
      orderBy: { submittedAt: "asc" },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return Promise.all(
      records.map(async (record) => {
        const { user, ...rest } = record;
        const serialized = this.serialize(rest);
        const documentKeys = this.parseDocumentKeys(record.documentKeys);
        const documents = await Promise.all(
          documentKeys.map(async (storageKey) => ({
            storageKey,
            url: await this.storage.getSignedUrl(storageKey),
          })),
        );
        return {
          ...serialized,
          user,
          documents,
        };
      }),
    );
  }

  async verify(userId: string, reviewerId: string): Promise<KycRecordResponse> {
    const existing = await this.requireSubmittedRecord(userId);
    const record = await this.prisma.kycRecord.update({
      where: { userId },
      data: {
        status: KycStatus.VERIFIED,
        reviewerId,
        reviewNote: null,
        reviewedAt: new Date(),
      },
    });
    void this.notifications.create({
      userId,
      type: NotificationType.KYC_VERIFIED,
      title: "Identity verified",
      body: "Your identity verification has been approved. You can proceed with property purchases.",
      entityId: existing.id,
      entityType: "KycRecord",
    });
    return this.serialize(record);
  }

  async reject(userId: string, reviewerId: string, note: string): Promise<KycRecordResponse> {
    const trimmed = note.trim();
    if (!trimmed) {
      throw new BadRequestException("note is required when rejecting KYC");
    }

    const existing = await this.requireSubmittedRecord(userId);
    const record = await this.prisma.kycRecord.update({
      where: { userId },
      data: {
        status: KycStatus.REJECTED,
        reviewerId,
        reviewNote: trimmed,
        reviewedAt: new Date(),
      },
    });
    void this.notifications.create({
      userId,
      type: NotificationType.KYC_REJECTED,
      title: "Identity verification rejected",
      body: trimmed,
      entityId: existing.id,
      entityType: "KycRecord",
    });
    return this.serialize(record);
  }

  private async requireSubmittedRecord(userId: string): Promise<KycRecord> {
    const existing = await this.prisma.kycRecord.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException("KYC record not found");
    if (existing.status !== KycStatus.SUBMITTED) {
      throw new BadRequestException("Only submitted KYC records can be reviewed");
    }
    return existing;
  }

  private assertDocumentKeysOwnedByUser(userId: string, documentKeys: string[]) {
    const prefix = `kyc/${userId}/`;
    for (const key of documentKeys) {
      const normalized = key.replace(/\\/g, "/");
      if (!normalized.startsWith(prefix)) {
        throw new ForbiddenException("Invalid document key for this user");
      }
    }
  }

  private parseDocumentKeys(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
  }

  private emptyRecord(userId: string): KycRecordResponse {
    return {
      id: null,
      userId,
      status: KycStatus.NOT_SUBMITTED,
      documentKeys: [],
      reviewerId: null,
      reviewNote: null,
      submittedAt: null,
      reviewedAt: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  private serialize(record: KycRecord): KycRecordResponse {
    return {
      id: record.id,
      userId: record.userId,
      status: record.status,
      documentKeys: this.parseDocumentKeys(record.documentKeys),
      reviewerId: record.reviewerId,
      reviewNote: record.reviewNote,
      submittedAt: record.submittedAt?.toISOString() ?? null,
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
