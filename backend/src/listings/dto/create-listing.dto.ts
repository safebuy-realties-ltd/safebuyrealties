import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";
import { ListingStatus } from "@prisma/client";

export class CreateListingDto {
  /** Required when creating as staff/admin on behalf of a seller */
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsString()
  @MinLength(1)
  location!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;
}
