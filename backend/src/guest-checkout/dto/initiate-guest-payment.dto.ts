import { Transform } from "class-transformer";
import { IsEmail, IsString, MinLength } from "class-validator";

function trimLowerEmail({ value }: { value: unknown }) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export class InitiateGuestPaymentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Transform(trimLowerEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  phone!: string;

  @IsString()
  @MinLength(8)
  callbackUrl!: string;
}
