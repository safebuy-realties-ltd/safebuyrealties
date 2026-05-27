import { ArrayMinSize, IsArray, IsString } from "class-validator";

export class SubmitKycDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  documentKeys!: string[];
}
