import { Test, TestingModule } from "@nestjs/testing";
import type { Response } from "express";
import { HealthController } from "./health.controller";
import { PaystackService } from "../payments/paystack.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

const LIVE_KEY = "sk_live_deadbeefdeadbeefdeadbeef";
const BUCKET = "safebuyrealties-prod-documents";
const DB_HOST = "ep-secret-shard-42.eu-central-1.aws.neon.tech";
const DB_URL = `postgresql://sbr_admin:hunter2@${DB_HOST}/safebuyrealties?sslmode=require`;

describe("HealthController", () => {
  let controller: HealthController;
  let paystack: { isConfigured: jest.Mock; secretKey: jest.Mock };
  let prisma: { $queryRaw: jest.Mock };
  let storage: { configStatus: jest.Mock };

  function makeResponse(): Response & { status: jest.Mock } {
    return { status: jest.fn() } as unknown as Response & { status: jest.Mock };
  }

  beforeEach(async () => {
    paystack = {
      isConfigured: jest.fn().mockReturnValue(true),
      secretKey: jest.fn().mockReturnValue(LIVE_KEY),
    };
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]) };
    storage = { configStatus: jest.fn().mockReturnValue({ ok: true }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PaystackService, useValue: paystack },
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it("keeps the existing response shape", () => {
    expect(controller.check()).toEqual(
      expect.objectContaining({ status: "ok", service: "safebuyrealties-api" }),
    );
  });

  it("reports payment configuration as booleans", () => {
    const body = controller.check();

    expect(body.paymentsConfigured).toBe(true);
    expect(body.paymentsMockMode).toBe(false);
  });

  it("reports mock mode when the gateway is not configured", () => {
    paystack.isConfigured.mockReturnValue(false);
    const body = controller.check();

    expect(body.paymentsConfigured).toBe(false);
    expect(body.paymentsMockMode).toBe(true);
  });

  it("never exposes the key, or any prefix or suffix of it", () => {
    const serialized = JSON.stringify(controller.check());

    expect(serialized).not.toContain(LIVE_KEY);
    // A prefix or suffix would narrow a brute-force search, so neither may appear either.
    for (let length = 6; length <= LIVE_KEY.length; length += 1) {
      expect(serialized).not.toContain(LIVE_KEY.slice(0, length));
      expect(serialized).not.toContain(LIVE_KEY.slice(-length));
    }
    expect(paystack.secretKey).not.toHaveBeenCalled();
  });

  it("emits only booleans beyond the existing string fields", () => {
    const { status, service, ...rest } = controller.check();

    expect(typeof status).toBe("string");
    expect(typeof service).toBe("string");
    for (const value of Object.values(rest)) {
      expect(typeof value).toBe("boolean");
    }
  });

  describe("GET /health/live", () => {
    it("touches no dependency", () => {
      expect(controller.live()).toEqual({ status: "ok", service: "safebuyrealties-api" });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(storage.configStatus).not.toHaveBeenCalled();
      expect(paystack.isConfigured).not.toHaveBeenCalled();
    });

    it("still reports ok while the database is down", () => {
      // A dead database must not get a live process restarted.
      prisma.$queryRaw.mockRejectedValue(new Error(`connect ECONNREFUSED ${DB_URL}`));

      expect(controller.live()).toEqual({ status: "ok", service: "safebuyrealties-api" });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("GET /health/ready", () => {
    it("reports every dependency and returns 200 when all are healthy", async () => {
      const res = makeResponse();

      const body = await controller.ready(res);

      expect(body).toEqual({
        status: "ok",
        checks: { database: "ok", storage: "ok", payments: "ok" },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it("returns 503 with the failing dependency named when the database is down", async () => {
      prisma.$queryRaw.mockRejectedValue(new Error(`connect ECONNREFUSED ${DB_URL}`));
      const res = makeResponse();

      const body = await controller.ready(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(body.status).toBe("unavailable");
      expect(body.checks.database).toBe("unavailable");
      // The other checks still report, so an operator can see what else is wrong.
      expect(body.checks.storage).toBe("ok");
      expect(body.checks.payments).toBe("ok");
    });

    it("returns 503 when object storage is misconfigured", async () => {
      storage.configStatus.mockReturnValue({ ok: false, reason: "s3_missing_region_or_bucket" });
      const res = makeResponse();

      const body = await controller.ready(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(body.status).toBe("unavailable");
      expect(body.checks.storage).toBe("misconfigured");
      expect(body.checks.database).toBe("ok");
    });

    it("does not throw when a dependency check throws synchronously", async () => {
      storage.configStatus.mockImplementation(() => {
        throw new Error(`Unsupported STORAGE_DRIVER for bucket ${BUCKET}`);
      });
      const res = makeResponse();

      await expect(controller.ready(res)).resolves.toMatchObject({
        status: "unavailable",
        checks: expect.objectContaining({ storage: "unavailable" }),
      });
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("stays ready with mock payments outside production", async () => {
      paystack.isConfigured.mockReturnValue(false);
      const res = makeResponse();

      const body = await controller.ready(res);

      expect(body.checks.payments).toBe("mock");
      expect(body.status).toBe("ok");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("refuses traffic with mock payments in production", async () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      paystack.isConfigured.mockReturnValue(false);
      const res = makeResponse();

      try {
        const body = await controller.ready(res);

        expect(body.checks.payments).toBe("misconfigured");
        expect(res.status).toHaveBeenCalledWith(503);
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    it("leaks no key, bucket, connection string or hostname when everything is broken", async () => {
      prisma.$queryRaw.mockRejectedValue(new Error(`connect ECONNREFUSED ${DB_URL}`));
      storage.configStatus.mockReturnValue({ ok: false, reason: "s3_missing_region_or_bucket" });
      paystack.isConfigured.mockReturnValue(false);
      const res = makeResponse();

      const serialized = JSON.stringify(await controller.ready(res));

      expect(serialized).not.toContain(LIVE_KEY);
      expect(serialized).not.toContain(BUCKET);
      expect(serialized).not.toContain(DB_URL);
      expect(serialized).not.toContain(DB_HOST);
      expect(serialized).not.toContain("hunter2");
      // Nothing derived from configuration at all: only the fixed status vocabulary.
      for (const value of Object.values(JSON.parse(serialized).checks as Record<string, string>)) {
        expect(["ok", "unavailable", "timeout", "misconfigured", "mock"]).toContain(value);
      }
      expect(paystack.secretKey).not.toHaveBeenCalled();
    });
  });
});
