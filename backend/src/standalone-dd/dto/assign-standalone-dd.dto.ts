import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class AssignStandaloneDdDto {
  @IsUUID()
  professionalId!: string;

  /** Catalog item code (LEGAL_CHECK, …) or FULL_DD */
  @IsString()
  @MinLength(2)
  scheduleCode!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
