import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { UserRole, ProfessionalType } from "@prisma/client";

function trimLowerEmail({ value }: { value: unknown }) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export class CreateUserDto {
  @Transform(trimLowerEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsEnum(ProfessionalType)
  professionalType?: ProfessionalType;
}
