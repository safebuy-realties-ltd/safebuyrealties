import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { Throttle } from "../common/decorators/throttle.decorator";
import { InitiatePaymentDto } from "./dto/initiate-payment.dto";
import { StartPurchaseDto } from "./dto/start-purchase.dto";
import { RequiresFeature } from "../common/decorators/feature.decorator";

@Controller("payments")
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get("config")
  config() {
    return { data: this.payments.getPaymentConfig() };
  }

  /** Every call here opens a transaction with the gateway, so unbounded callers cost real money. */
  @Post("initiate")
  @Throttle("payment_initiate")
  initiate(@Body() dto: InitiatePaymentDto, @CurrentUser() user: JwtPayload) {
    return this.payments.initiate(dto, user);
  }

  /**
   * E1-S4. Buying the property a transaction is against.
   *
   * Separate from `initiate` because the amount is the full price of the listing and the server has
   * to be the one that reads it, and because the whole step is behind a flag. With the flag off the
   * global `FeatureGuard` answers 404, so a browser that has not been told the feature exists cannot
   * tell this route from one that was never written.
   *
   * Throttled on the same bucket as `initiate`: it opens a transaction with the gateway, and that
   * costs real money whoever is calling it.
   */
  @Post("purchase")
  @RequiresFeature("property_purchase")
  @Throttle("payment_initiate")
  startPurchase(@Body() dto: StartPurchaseDto, @CurrentUser() user: JwtPayload) {
    return this.payments.startPurchase(dto, user);
  }

  @Post(":id/verify")
  verify(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.payments.verifyTransaction(id, user);
  }

  /**
   * The buyer closed the checkout window. Gated on the same flag as the purchase itself, since a
   * purchase that cannot be started has nothing to abandon.
   */
  @Post(":id/abandon")
  @RequiresFeature("property_purchase")
  abandon(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.payments.abandonPayment(id, user);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.payments.findOne(id, user);
  }
}
