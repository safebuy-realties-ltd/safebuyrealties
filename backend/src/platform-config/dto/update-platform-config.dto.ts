import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";

export class UpdatePlatformConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  vatRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxUploadMb?: number;

  @IsOptional()
  @IsBoolean()
  paystackEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  flutterwaveEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;
}
