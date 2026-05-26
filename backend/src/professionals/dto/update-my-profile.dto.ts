import { IsISO8601, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateMyProfileDto {
  @IsString()
  @IsNotEmpty()
  regulatoryBody!: string;

  @IsString()
  @IsNotEmpty()
  licenseNumber!: string;

  @IsOptional()
  @IsISO8601()
  licenseExpiry?: string;
}
