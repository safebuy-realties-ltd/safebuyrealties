import { Transform } from "class-transformer";
import { IsEmail, IsString, MinLength } from "class-validator";

function trimLowerEmail({ value }: { value: unknown }) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export class LoginDto {
  @Transform(trimLowerEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
