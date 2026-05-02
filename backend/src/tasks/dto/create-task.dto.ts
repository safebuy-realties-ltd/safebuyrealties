import { IsOptional, IsString, MinLength, IsDateString } from "class-validator";

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  listingId!: string;

  @IsString()
  @MinLength(1)
  assigneeId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  type!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
