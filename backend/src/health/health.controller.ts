import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { PaystackService } from "../payments/paystack.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { isProductionEnvironment } from "../config/payments-guard";
import { CHECK_TIMEOUT_MS, CheckStatus, runCheck } from "./health-check";

/** Statuses an instance can serve traffic with. Mock payments are normal outside production. */
const READY_STATUSES: ReadonlySet<CheckStatus> = new Set<CheckStatus>(["ok", "mock"]);

export type ReadinessBody = {
  status: "ok" | "unavailable";
  checks: { database: CheckStatus; storage: CheckStatus; payments: CheckStatus };
};

@Controller("health")
export class HealthController {
  constructor(
    private readonly paystack: PaystackService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  check() {
    // paymentsConfigured is deliberately a bare boolean. /health is unauthenticated and
    // exempt from the maintenance guard, so it must never carry the key, any part of the
    // key, or anything (length, prefix, suffix) an attacker could narrow a guess with.
    const paymentsConfigured = this.paystack.isConfigured();
    return {
      status: "ok",
      service: "safebuyrealties-api",
      paymentsConfigured,
      paymentsMockMode: !paymentsConfigured,
    };
  }

  /**
   * Liveness: is the process running? Touches no dependency, so a database outage never
   * gets an otherwise healthy instance restarted.
   */
  @Get("live")
  live() {
    return { status: "ok", service: "safebuyrealties-api" };
  }

  /**
   * Readiness: should this instance take traffic? Every dependency reports its own state,
   * each behind its own timeout, and a failure is a 503 rather than a 200 carrying bad news.
   */
  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessBody> {
    const [database, storage, payments] = await Promise.all([
      runCheck(() => this.checkDatabase(), CHECK_TIMEOUT_MS.database),
      runCheck(() => this.checkStorage(), CHECK_TIMEOUT_MS.storage),
      runCheck(() => this.checkPayments(), CHECK_TIMEOUT_MS.payments),
    ]);

    const checks = { database, storage, payments };
    const ready = Object.values(checks).every((status) => READY_STATUSES.has(status));
    res.status(ready ? 200 : 503);
    return { status: ready ? "ok" : "unavailable", checks };
  }

  /** Cheapest round trip that proves the pool can reach Postgres. Reads no table. */
  private async checkDatabase(): Promise<CheckStatus> {
    await this.prisma.$queryRaw`SELECT 1`;
    return "ok";
  }

  private checkStorage(): CheckStatus {
    return this.storage.configStatus().ok ? "ok" : "misconfigured";
  }

  private checkPayments(): CheckStatus {
    if (this.paystack.isConfigured()) return "ok";
    // Mock mode is a legitimate local setup. In production it means money never moves, so
    // the instance must not take traffic; main.ts refuses to boot there and this is the
    // second line of that defence.
    return isProductionEnvironment() ? "misconfigured" : "mock";
  }
}
