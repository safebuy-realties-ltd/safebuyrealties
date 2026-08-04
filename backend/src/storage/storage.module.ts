import { Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { DocumentGrantService } from "./document-grant.service";
import { PrivateDocumentAuthorizer } from "./private-document-authorizer";
import { PrivateDocumentController } from "./private-document.controller";

// PrismaModule is @Global(), so the authorizer's PrismaService needs no import added here — the
// same reason the controller's AuditService needs none.
//
// DocumentGrantService is exported because grants are issued away from here, by the route that
// hands a buyer their reports (E1-S3), and checked here. Signing and checking have to agree on one
// key, so there is one provider rather than a copy on each side.
@Module({
  controllers: [PrivateDocumentController],
  providers: [StorageService, DocumentGrantService, PrivateDocumentAuthorizer],
  exports: [StorageService, DocumentGrantService],
})
export class StorageModule {}
