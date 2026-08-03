import { IsIn, IsOptional, IsString } from "class-validator";
import { DD_ORDER_STATUS } from "../../dd-core/dd-case.constants";

const STATUSES = Object.values(DD_ORDER_STATUS);

/**
 * `status` accepts any of the six case statuses, not only the ones reachable from here.
 *
 * It would be shorter to list the legal targets and let class-validator reject the rest, and it
 * would also mean the state table was decorative: a move from `COMPLETE` back to `IN_PROGRESS` would
 * be refused by a decorator that knows the vocabulary but not the case, with a message that says the
 * status is invalid when the status is perfectly valid and the move is what is wrong. The validator
 * checks that a status was named. `LISTING_DD_TRANSITIONS` decides whether it can be reached.
 *
 * `verdict` is free text rather than the three values the schema comment lists, because the
 * standalone path has been writing free text into the same column since it shipped and one column
 * cannot be half constrained.
 */
export class UpdateDdOrderDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  verdict?: string;

  @IsOptional()
  @IsString()
  staffNotes?: string;
}
