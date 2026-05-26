import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class RequestRevisionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string;
}
