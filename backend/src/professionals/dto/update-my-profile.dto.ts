import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateMyProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  regulatoryBody!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  licenseNumber!: string;

  @IsOptional()
  @IsISO8601()
  licenseExpiry?: string;
}
