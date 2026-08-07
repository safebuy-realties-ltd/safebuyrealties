import { IsBoolean, IsIn, IsNotEmpty, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class ConsentFlagsDto {
  @IsBoolean()
  legalCapacity!: boolean;

  @IsBoolean()
  witnessingRequired!: boolean;

  @IsBoolean()
  landRegistryRegistration!: boolean;

  @IsBoolean()
  irrevocability!: boolean;
}

export class ExecutePoaDto {
  @IsString()
  @IsNotEmpty()
  transactionId!: string;

  @IsIn(["DRAWN", "TYPED"])
  signatureMethod!: "DRAWN" | "TYPED";

  @IsString()
  @IsNotEmpty()
  signatureName!: string;

  @ValidateNested()
  @Type(() => ConsentFlagsDto)
  consentFlags!: ConsentFlagsDto;
}
