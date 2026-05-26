import { Module } from "@nestjs/common";
import { DueDiligenceController } from "./due-diligence.controller";
import { DueDiligenceService } from "./due-diligence.service";
import { PlatformConfigModule } from "../platform-config/platform-config.module";

@Module({
  imports: [PlatformConfigModule],
  controllers: [DueDiligenceController],
  providers: [DueDiligenceService],
  exports: [DueDiligenceService],
})
export class DueDiligenceModule {}
