import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { InitiatePaymentDto } from "./dto/initiate-payment.dto";

@Controller("payments")
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Post("initiate")
  initiate(@Body() dto: InitiatePaymentDto, @CurrentUser() user: JwtPayload) {
    return this.payments.initiate(dto, user);
  }

  @Post(":id/verify")
  verify(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.payments.verifyTransaction(id, user);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.payments.findOne(id, user);
  }
}
