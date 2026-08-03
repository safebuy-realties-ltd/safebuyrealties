import { Module } from "@nestjs/common";
import { DueDiligenceController } from "./due-diligence.controller";
import { DueDiligenceAssignmentsController } from "./due-diligence-assignments.controller";
import { DueDiligenceService } from "./due-diligence.service";
import { DueDiligenceCaseService } from "./due-diligence-case.service";
import { PlatformConfigModule } from "../platform-config/platform-config.module";
import { DdCoreModule } from "../dd-core/dd-core.module";

@Module({
  imports: [PlatformConfigModule, DdCoreModule],
  controllers: [DueDiligenceController, DueDiligenceAssignmentsController],
  providers: [DueDiligenceService, DueDiligenceCaseService],
  exports: [DueDiligenceService],
})
export class DueDiligenceModule {}
