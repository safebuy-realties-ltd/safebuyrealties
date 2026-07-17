import { Module } from "@nestjs/common";
import { StandaloneDdController } from "./standalone-dd.controller";
import { StandaloneDdService } from "./standalone-dd.service";
import { PlatformConfigModule } from "../platform-config/platform-config.module";
import { PaystackModule } from "../payments/paystack.module";
import { EmailModule } from "../email/email.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [
    PlatformConfigModule,
    PaystackModule,
    EmailModule,
    NotificationsModule,
    StorageModule,
  ],
  controllers: [StandaloneDdController],
  providers: [StandaloneDdService],
  exports: [StandaloneDdService],
})
export class StandaloneDdModule {}
