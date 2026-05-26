import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class VerifyCredentialDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionNote?: string;
}
