import { Module } from "@nestjs/common";
import { ListingsModule } from "../listings/listings.module";
import { VerificationService } from "./verification.service";
import { VerificationController } from "./verification.controller";

@Module({
  imports: [ListingsModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
