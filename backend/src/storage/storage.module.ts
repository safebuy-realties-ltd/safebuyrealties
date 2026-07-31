import { Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { PrivateDocumentAuthorizer } from "./private-document-authorizer";
import { PrivateDocumentController } from "./private-document.controller";

// PrismaModule is @Global(), so the authorizer's PrismaService needs no import added here — the
// same reason the controller's AuditService needs none.
@Module({
  controllers: [PrivateDocumentController],
  providers: [StorageService, PrivateDocumentAuthorizer],
  exports: [StorageService],
})
export class StorageModule {}
