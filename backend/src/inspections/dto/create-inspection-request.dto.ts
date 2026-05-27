import { IsDateString, IsOptional, IsString } from "class-validator";

export class CreateInspectionRequestDto {
  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
