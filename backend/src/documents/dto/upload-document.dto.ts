import { IsString, MinLength } from "class-validator";

export class UploadDocumentMetaDto {
  @IsString()
  @MinLength(1)
  listingId!: string;

  @IsString()
  @MinLength(1)
  category!: string;
}
