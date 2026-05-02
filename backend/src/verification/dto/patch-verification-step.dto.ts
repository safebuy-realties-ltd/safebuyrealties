import { IsArray, IsEnum, IsOptional, IsString } from "class-validator";
import { VerificationStepStatus } from "@prisma/client";

export class PatchVerificationStepDto {
  @IsOptional()
  @IsEnum(VerificationStepStatus)
  status?: VerificationStepStatus;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  riskFlags?: string[];
}
