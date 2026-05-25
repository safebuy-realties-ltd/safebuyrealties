import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { DocumentsService } from "./documents.service";
import { DocumentsController } from "./documents.controller";

@Module({
  imports: [StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
