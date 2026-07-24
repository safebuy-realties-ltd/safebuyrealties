import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { AUTH_PORTALS, type AuthPortal } from "../../common/auth-portals";

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

  /** When set, login is rejected unless the user's role belongs to this portal. */
  @IsOptional()
  @IsIn([...AUTH_PORTALS])
  portal?: AuthPortal;
}
