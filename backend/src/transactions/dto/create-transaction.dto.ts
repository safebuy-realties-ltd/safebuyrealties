import { IsUUID } from "class-validator";

export class CreateTransactionDto {
  @IsUUID()
  listingId!: string;
}
