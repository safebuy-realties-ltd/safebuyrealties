import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PaystackModule } from "../payments/paystack.module";

@Module({
  imports: [PaystackModule],
  controllers: [HealthController],
})
export class HealthModule {}
