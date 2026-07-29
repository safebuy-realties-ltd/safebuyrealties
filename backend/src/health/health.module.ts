import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PaystackModule } from "../payments/paystack.module";
import { StorageModule } from "../storage/storage.module";

// PrismaModule is @Global, so PrismaService needs no import here.
@Module({
  imports: [PaystackModule, StorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
