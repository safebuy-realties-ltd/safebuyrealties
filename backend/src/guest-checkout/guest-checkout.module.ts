import { Module } from "@nestjs/common";
import { GuestCheckoutController } from "./guest-checkout.controller";
import { GuestCheckoutService } from "./guest-checkout.service";
import { PlatformConfigModule } from "../platform-config/platform-config.module";
import { PaystackModule } from "../payments/paystack.module";
import { EmailModule } from "../email/email.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [PlatformConfigModule, PaystackModule, EmailModule, NotificationsModule],
  controllers: [GuestCheckoutController],
  providers: [GuestCheckoutService],
  exports: [GuestCheckoutService],
})
export class GuestCheckoutModule {}
