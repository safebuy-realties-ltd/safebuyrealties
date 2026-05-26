import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdatePlatformConfigDto } from "./dto/update-platform-config.dto";

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

@Injectable()
export class PlatformConfigService {
  private cached: { value: PlatformConfigResponse; expiresAt: number } | null = null;

  constructor(private prisma: PrismaService) {}

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

  async update(dto: UpdatePlatformConfigDto, actorId: string): Promise<PlatformConfigResponse> {
    void actorId;
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
    return this.serialize(config);
  }

  async getVatRate(): Promise<number> {
    return Number((await this.get()).vatRate);
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
