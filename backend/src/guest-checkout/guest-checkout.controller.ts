import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { GuestCheckoutService } from "./guest-checkout.service";
import { CreateGuestOrderDto } from "./dto/create-guest-order.dto";
import { InitiateGuestPaymentDto } from "./dto/initiate-guest-payment.dto";

@Controller("guest-checkout")
export class GuestCheckoutController {
  constructor(private readonly guestCheckout: GuestCheckoutService) {}

  /** POST /guest-checkout/orders — public */
  @Post("orders")
  createOrder(@Body() dto: CreateGuestOrderDto) {
    return this.guestCheckout.createOrder(dto);
  }

  /** GET /guest-checkout/orders/:serviceId — public */
  @Get("orders/:serviceId")
  getOrder(@Param("serviceId") serviceId: string) {
    return this.guestCheckout.getOrder(serviceId);
  }

  /** POST /guest-checkout/orders/:serviceId/pay — public */
  @Post("orders/:serviceId/pay")
  initiatePayment(
    @Param("serviceId") serviceId: string,
    @Body() dto: InitiateGuestPaymentDto,
  ) {
    return this.guestCheckout.initiatePayment(serviceId, dto);
  }
}
