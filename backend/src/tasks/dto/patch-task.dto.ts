import {
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
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

  /** Pro task report UI — persisted in description when set. */
  @IsOptional()
  @IsString()
  completionNotes?: string;

  @IsOptional()
  @IsArray()
  checklist?: unknown[];

  @IsOptional()
  @IsObject()
  report?: Record<string, unknown>;
}
