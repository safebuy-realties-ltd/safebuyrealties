import { ArrayNotEmpty, IsArray, IsOptional, IsString } from "class-validator";

export class CreateDdOrderDto {
  @IsString()
  transactionId!: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  itemIds?: string[];

  @IsOptional()
  @IsString()
  bundleId?: string;
}
