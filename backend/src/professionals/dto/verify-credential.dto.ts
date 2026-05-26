import { IsBoolean, IsOptional, IsString } from "class-validator";

export class VerifyCredentialDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  rejectionNote?: string;
}
