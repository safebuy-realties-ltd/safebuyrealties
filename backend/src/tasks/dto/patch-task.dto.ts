import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { TaskStatus } from "@prisma/client";

export class PatchTaskDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}
