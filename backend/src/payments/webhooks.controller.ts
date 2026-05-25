import { Controller, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { PaymentsService } from "./payments.service";

@Controller("webhooks/payments")
export class WebhooksController {
  constructor(private payments: PaymentsService) {}

  @Post(":provider")
  async handle(@Param("provider") provider: string, @Req() req: Request & { rawBody?: Buffer }) {
    if (provider !== "paystack") {
      return { received: false };
    }
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    const sig = req.headers["x-paystack-signature"] as string | undefined;
    if (!this.payments.verifyPaystackSignature(raw, sig)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    const body = req.body as { event?: string; data?: { reference?: string; status?: string } };
    return this.payments.handlePaystackWebhook(body);
  }
}
