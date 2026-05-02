import { IsEnum, IsString, MinLength } from "class-validator";
import { VerificationStepType } from "@prisma/client";

export class AssignVerificationDto {
  @IsString()
  @MinLength(1)
  listingId!: string;

  @IsString()
  @MinLength(1)
  professionalId!: string;

  @IsEnum(VerificationStepType)
  stepType!: VerificationStepType;
}
