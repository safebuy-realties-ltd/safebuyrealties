import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { PlatformConfigModule } from "../platform-config/platform-config.module";
import { DocumentsService } from "./documents.service";
import { DocumentsController } from "./documents.controller";

@Module({
  imports: [StorageModule, PlatformConfigModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
