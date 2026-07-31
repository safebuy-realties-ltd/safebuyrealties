import { Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { PrivateDocumentController } from "./private-document.controller";

@Module({
  controllers: [PrivateDocumentController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
