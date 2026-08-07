import { IsOptional, IsString, MaxLength } from "class-validator";
export class EscrowActionDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
