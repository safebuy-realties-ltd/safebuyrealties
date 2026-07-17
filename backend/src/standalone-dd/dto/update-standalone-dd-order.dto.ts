import { IsIn, IsOptional, IsString } from "class-validator";

export class UpdateStandaloneDdOrderDto {
  @IsOptional()
  @IsIn(["IN_PROGRESS", "COMPLETE"])
  status?: "IN_PROGRESS" | "COMPLETE";

  @IsOptional()
  @IsString()
  verdict?: string;

  @IsOptional()
  @IsString()
  staffNotes?: string;
}
