import { IsNotEmpty, IsString } from "class-validator";

export class RequestRevisionDto {
  @IsString()
  @IsNotEmpty()
  note!: string;
}
