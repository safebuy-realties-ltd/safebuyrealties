import { IsString, MinLength } from "class-validator";

/**
 * What the browser is allowed to say when it starts a property purchase.
 *
 * There is no `amount` here and that is the point of the story. The full price of a property is not
 * something a browser should be trusted to state, and the previous flow read it off the listing in
 * the page and posted it back. The transaction names the listing, the listing carries the price, and
 * the server reads it there.
 *
 * There is no `intent` either. This route buys a property and does nothing else, so an intent field
 * would only be a way to ask it to do something different.
 */
export class StartPurchaseDto {
  @IsString()
  @MinLength(1)
  transactionId!: string;

  /** Where the gateway returns the buyer once they are done, successfully or not. */
  @IsString()
  @MinLength(8)
  callbackUrl!: string;
}
