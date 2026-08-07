import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { UpdatePlatformConfigDto } from "./dto/update-platform-config.dto";
import { isInternalRole } from "../common/user-roles";

const SINGLETON_ID = "singleton";
const CACHE_TTL_MS = 60_000;

type PlatformConfigRow = {
  id: string;
  vatRate: Prisma.Decimal;
  maxUploadMb: number;
  paystackEnabled: boolean;
  flutterwaveEnabled: boolean;
  maintenanceMode: boolean;
  updatedAt: Date;
};

export type PlatformConfigResponse = {
  id: string;
  vatRate: string;
  maxUploadMb: number;
  paystackEnabled: boolean;
  flutterwaveEnabled: boolean;
  maintenanceMode: boolean;
  updatedAt: string;
};

/** Fields safe for any authenticated role (buyers, sellers, pros). */
export type PlatformConfigPublicResponse = {
  vatRate: string;
  maxUploadMb: number;
  paystackEnabled: boolean;
  paystackPublicKey: string | null;
};

@Injectable()
export class PlatformConfigService {
  private cached: { value: PlatformConfigResponse; expiresAt: number } | null = null;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private config: ConfigService,
  ) {}

  async get(): Promise<PlatformConfigResponse> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.value;
    }

    const config = await this.prisma.platformConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
    const value = this.serialize(config);
    this.cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  }

  getForRole(
    role: UserRole,
    config: PlatformConfigResponse,
  ): PlatformConfigResponse | PlatformConfigPublicResponse {
    if (isInternalRole(role)) {
      return config;
    }
    return {
      vatRate: config.vatRate,
      maxUploadMb: config.maxUploadMb,
      paystackEnabled: config.paystackEnabled,
      paystackPublicKey: this.paystackPublicKey(),
    };
  }

  private paystackPublicKey(): string | null {
    const primary = this.config.get<string>("PAYSTACK_PUBLIC_KEY")?.trim();
    if (primary) return primary;
    return this.config.get<string>("PAYSTACK_TEST_PUBLIC_KEY")?.trim() || null;
  }

  async update(dto: UpdatePlatformConfigDto, actorId: string): Promise<PlatformConfigResponse> {
    const before = await this.get();
    const data = {
      ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
      ...(dto.maxUploadMb !== undefined ? { maxUploadMb: dto.maxUploadMb } : {}),
      ...(dto.paystackEnabled !== undefined ? { paystackEnabled: dto.paystackEnabled } : {}),
      ...(dto.flutterwaveEnabled !== undefined
        ? { flutterwaveEnabled: dto.flutterwaveEnabled }
        : {}),
      ...(dto.maintenanceMode !== undefined ? { maintenanceMode: dto.maintenanceMode } : {}),
    };

    const config = await this.prisma.platformConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });
    this.cached = null;
    const after = this.serialize(config);
    void this.audit.log({
      actorId,
      action: AuditAction.PLATFORM_CONFIG_UPDATED,
      entity: "PlatformConfig",
      entityId: SINGLETON_ID,
      before: {
        vatRate: before.vatRate,
        maxUploadMb: before.maxUploadMb,
        paystackEnabled: before.paystackEnabled,
        flutterwaveEnabled: before.flutterwaveEnabled,
        maintenanceMode: before.maintenanceMode,
      },
      after: {
        vatRate: after.vatRate,
        maxUploadMb: after.maxUploadMb,
        paystackEnabled: after.paystackEnabled,
        flutterwaveEnabled: after.flutterwaveEnabled,
        maintenanceMode: after.maintenanceMode,
      },
    });
    return after;
  }

  async getVatRate(): Promise<number> {
    return Number((await this.get()).vatRate);
  }

  async getInspectionFee(): Promise<number> {
    const config = await this.prisma.platformConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
    return Number(config.inspectionFee);
  }

  async getMaxUploadBytes(): Promise<number> {
    return (await this.get()).maxUploadMb * 1024 * 1024;
  }

  private serialize(config: PlatformConfigRow): PlatformConfigResponse {
    return {
      id: config.id,
      vatRate: config.vatRate.toString(),
      maxUploadMb: config.maxUploadMb,
      paystackEnabled: config.paystackEnabled,
      flutterwaveEnabled: config.flutterwaveEnabled,
      maintenanceMode: config.maintenanceMode,
      updatedAt: config.updatedAt.toISOString(),
    };
  }
}
