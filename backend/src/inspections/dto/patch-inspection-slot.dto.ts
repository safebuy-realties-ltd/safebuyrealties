import { IsIn, IsOptional, IsString } from "class-validator";

const STATUSES = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;

export class PatchInspectionSlotDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  professionalId?: string;
}
