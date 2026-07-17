import { Module, forwardRef } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { WebhooksController } from "./webhooks.controller";
import { EscrowModule } from "../escrow/escrow.module";
import { PaystackModule } from "./paystack.module";
import { GuestCheckoutModule } from "../guest-checkout/guest-checkout.module";
import { StandaloneDdModule } from "../standalone-dd/standalone-dd.module";

@Module({
  imports: [
    EscrowModule,
    PaystackModule,
    forwardRef(() => GuestCheckoutModule),
    StandaloneDdModule,
  ],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
