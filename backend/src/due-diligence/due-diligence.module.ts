import { Module } from "@nestjs/common";
import { DueDiligenceController } from "./due-diligence.controller";
import { DueDiligenceAssignmentsController } from "./due-diligence-assignments.controller";
import { DueDiligenceService } from "./due-diligence.service";
import { DueDiligenceCaseService } from "./due-diligence-case.service";
import { PlatformConfigModule } from "../platform-config/platform-config.module";
import { DdCoreModule } from "../dd-core/dd-core.module";
import { StorageModule } from "../storage/storage.module";

// StorageModule is imported for DocumentGrantService, which signs the download links E1-S3 hands
// buyers. DdCoreModule imports it too, for the serializer, but does not re-export it, and depending
// on somebody else's imports is how a module ends up broken by a change it has nothing to do with.
@Module({
  imports: [PlatformConfigModule, DdCoreModule, StorageModule],
  controllers: [DueDiligenceController, DueDiligenceAssignmentsController],
  providers: [DueDiligenceService, DueDiligenceCaseService],
  exports: [DueDiligenceService],
})
export class DueDiligenceModule {}
