import { Controller, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { PaymentsService, type PaystackWebhookPayload } from "./payments.service";
import { Throttle } from "../common/decorators/throttle.decorator";

/**
 * E5-S1 criterion 4. Paystack retries from a small set of addresses, so under the global limit a
 * burst of genuine retries counts as one caller hammering the API, and refusing one of them strands
 * a payment the buyer has already made. This policy is its own and it is high; the signature check
 * below is what actually guards the route, and the limit is only here so an unsigned flood cannot
 * cost unbounded HMAC work.
 */
@Controller("webhooks/payments")
@Throttle("webhook")
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
    // The signature above is what makes this cast defensible: the body is Paystack's or it never
    // reached this line. The shape is still all-optional, because a verified sender can still send
    // an event we have never seen.
    const body = req.body as PaystackWebhookPayload;
    return this.payments.handlePaystackWebhook(body);
  }
}
