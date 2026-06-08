import { Module } from "@nestjs/common";
import { EscrowService } from "./escrow.service";
import { EscrowController } from "./escrow.controller";
import { PaystackModule } from "../payments/paystack.module";

@Module({
  imports: [PaystackModule],
  controllers: [EscrowController],
  providers: [EscrowService],
  exports: [EscrowService],
})
export class EscrowModule {}
