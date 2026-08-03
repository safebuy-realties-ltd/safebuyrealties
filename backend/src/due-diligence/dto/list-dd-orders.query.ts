import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { DD_ORDER_STATUS } from "../../dd-core/dd-case.constants";

const STATUSES = Object.values(DD_ORDER_STATUS);

export class ListDdOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;
}
