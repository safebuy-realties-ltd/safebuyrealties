import { Transform } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  ValidateIf,
} from "class-validator";

function trimLowerEmail({ value }: { value: unknown }) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export class CreateGuestOrderDto {
  @IsString()
  listingId!: string;

  @Transform(trimLowerEmail)
  @IsEmail()
  guestEmail!: string;

  @IsOptional()
  @IsString()
  guestName?: string;

  @IsOptional()
  @IsString()
  guestPhone?: string;

  @ValidateIf((o: CreateGuestOrderDto) => !o.bundleId)
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  itemIds?: string[];

  @ValidateIf((o: CreateGuestOrderDto) => !o.itemIds?.length)
  @IsOptional()
  @IsString()
  bundleId?: string;

  @IsOptional()
  @IsBoolean()
  includeInspection?: boolean;
}
