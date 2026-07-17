import { IsOptional, IsString } from "class-validator";

export class ListStandaloneDdOrdersQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}
