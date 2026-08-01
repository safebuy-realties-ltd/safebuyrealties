import { IsBoolean } from "class-validator";

export class SetFeatureFlagDto {
  @IsBoolean()
  enabled!: boolean;
}

export class SetKillSwitchDto {
  @IsBoolean()
  armed!: boolean;
}
