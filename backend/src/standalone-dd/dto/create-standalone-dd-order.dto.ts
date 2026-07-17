import { Transform, Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from "class-validator";

function trimLowerEmail({ value }: { value: unknown }) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export class ExternalPropertyDto {
  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsOptional()
  @IsString()
  lga?: string;

  @IsOptional()
  @IsString()
  propertyType?: string;

  @IsOptional()
  @IsString()
  approxSize?: string;

  @IsOptional()
  @IsString()
  titleRef?: string;

  @IsOptional()
  @IsString()
  sellerName?: string;

  @IsOptional()
  @IsString()
  sellerContact?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateStandaloneDdOrderDto {
  @IsOptional()
  @IsString()
  listingId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalPropertyDto)
  externalProperty?: ExternalPropertyDto;

  @IsString()
  @IsNotEmpty()
  guestName!: string;

  @Transform(trimLowerEmail)
  @IsEmail()
  guestEmail!: string;

  @IsString()
  @IsNotEmpty()
  guestPhone!: string;

  @ValidateIf((o: CreateStandaloneDdOrderDto) => !o.bundleId)
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  itemIds?: string[];

  @ValidateIf((o: CreateStandaloneDdOrderDto) => !o.itemIds?.length)
  @IsOptional()
  @IsString()
  bundleId?: string;
}
