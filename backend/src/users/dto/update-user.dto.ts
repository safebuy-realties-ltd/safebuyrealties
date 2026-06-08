import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { UserRole, ProfessionalType } from "@prisma/client";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Staff/admin only */
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(ProfessionalType)
  professionalType?: ProfessionalType | null;

  /** Staff+ only; cannot deactivate self or super admins (unless actor is super admin). */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
