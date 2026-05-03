import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { VerificationStepType } from "@prisma/client";

export class AssignVerificationDto {
  @IsString()
  @MinLength(1)
  listingId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  professionalId?: string;

  @IsOptional()
  @IsEnum(VerificationStepType)
  stepType?: VerificationStepType;
}
