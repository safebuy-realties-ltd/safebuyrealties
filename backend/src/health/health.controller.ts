import { Controller, Get } from "@nestjs/common";
import { PaystackService } from "../payments/paystack.service";

@Controller("health")
export class HealthController {
  constructor(private readonly paystack: PaystackService) {}

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
}
