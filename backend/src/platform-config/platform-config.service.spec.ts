import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformConfigService } from "./platform-config.service";

const baseConfig = {
  id: "singleton",
  vatRate: new Prisma.Decimal("0.075"),
  maxUploadMb: 15,
  paystackEnabled: true,
  flutterwaveEnabled: false,
  maintenanceMode: false,
  updatedAt: new Date("2026-05-26T12:00:00.000Z"),
};

describe("PlatformConfigService", () => {
  let service: PlatformConfigService;
  let prisma: {
    platformConfig: {
      upsert: jest.Mock;
    };
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-26T12:00:00.000Z"));
    prisma = {
      platformConfig: {
        upsert: jest.fn().mockResolvedValue(baseConfig),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PlatformConfigService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PlatformConfigService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("upserts the singleton on first get and serializes decimal values", async () => {
    const result = await service.get();

    expect(prisma.platformConfig.upsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    });
    expect(result).toEqual({
      id: "singleton",
      vatRate: "0.075",
      maxUploadMb: 15,
      paystackEnabled: true,
      flutterwaveEnabled: false,
      maintenanceMode: false,
      updatedAt: "2026-05-26T12:00:00.000Z",
    });
  });

  it("caches reads for 60 seconds", async () => {
    await service.get();
    await service.get();

    expect(prisma.platformConfig.upsert).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60_001);
    await service.get();

    expect(prisma.platformConfig.upsert).toHaveBeenCalledTimes(2);
  });

  it("updates the singleton and invalidates the cached read", async () => {
    await service.get();
    prisma.platformConfig.upsert.mockResolvedValueOnce({
      ...baseConfig,
      vatRate: new Prisma.Decimal("0.0825"),
      maxUploadMb: 25,
      paystackEnabled: false,
      updatedAt: new Date("2026-05-26T12:01:00.000Z"),
    });

    const result = await service.update(
      {
        vatRate: 0.0825,
        maxUploadMb: 25,
        paystackEnabled: false,
      },
      "admin-1",
    );

    expect(prisma.platformConfig.upsert).toHaveBeenLastCalledWith({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        vatRate: 0.0825,
        maxUploadMb: 25,
        paystackEnabled: false,
      },
      update: {
        vatRate: 0.0825,
        maxUploadMb: 25,
        paystackEnabled: false,
      },
    });
    expect(result).toMatchObject({
      vatRate: "0.0825",
      maxUploadMb: 25,
      paystackEnabled: false,
    });

    await service.get();
    expect(prisma.platformConfig.upsert).toHaveBeenCalledTimes(3);
  });

  it("returns numeric helpers for downstream calculations", async () => {
    expect(await service.getVatRate()).toBe(0.075);
    expect(await service.getMaxUploadBytes()).toBe(15 * 1024 * 1024);
  });
});
