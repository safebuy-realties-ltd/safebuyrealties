import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { WebhooksController } from "./webhooks.controller";
import { EscrowModule } from "../escrow/escrow.module";
import { PaystackModule } from "./paystack.module";

@Module({
  imports: [EscrowModule, PaystackModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
