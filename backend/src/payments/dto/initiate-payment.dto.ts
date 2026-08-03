import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";
import { PaymentIntent } from "@prisma/client";

/**
 * The intents a caller may name on this route, which is every intent except buying a property.
 *
 * A property purchase is the one payment whose amount the server has to decide, because it is the
 * full price of the listing rather than a service fee. This route takes the amount from the request,
 * so allowing the purchase intent through it would leave a buyer able to name their own price. The
 * purchase has its own route, `POST /payments/purchase`, which reads the price off the listing.
 */
export const SELF_SERVE_PAYMENT_INTENTS: PaymentIntent[] = [PaymentIntent.DD_SERVICE];

export class InitiatePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  listingId?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsString()
  @MinLength(8)
  callbackUrl!: string;

  @IsOptional()
  @IsIn(SELF_SERVE_PAYMENT_INTENTS, {
    message: "A property purchase is started at POST /payments/purchase, not here",
  })
  intent?: PaymentIntent;

  @IsOptional()
  @IsString()
  ddOrderId?: string;
}
