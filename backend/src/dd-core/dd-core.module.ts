import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { DdCmsModule } from "../dd-cms/dd-cms.module";
import { DdCaseSerializer } from "./dd-case.serializer";
import { DdCoreService } from "./dd-core.service";

/**
 * The due diligence case machinery, imported by every module that runs a case.
 *
 * It carries no controller. There is no such thing as a case that belongs to no product, so there
 * is no route to hang here: `StandaloneDdModule` and `DueDiligenceModule` own the routes and this
 * module owns what they both do underneath. PrismaModule is `@Global()`, so it needs no import.
 */
@Module({
  imports: [StorageModule, DdCmsModule],
  providers: [DdCaseSerializer, DdCoreService],
  exports: [DdCaseSerializer, DdCoreService],
})
export class DdCoreModule {}
