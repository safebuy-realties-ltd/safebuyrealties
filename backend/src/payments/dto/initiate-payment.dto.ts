import { IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

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
}
