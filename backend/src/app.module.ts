import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { SbrIdModule } from "./sbr-id/sbr-id.module";
import { MaintenanceGuard } from "./common/guards/maintenance.guard";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ListingsModule } from "./listings/listings.module";
import { DocumentsModule } from "./documents/documents.module";
import { VerificationModule } from "./verification/verification.module";
import { TasksModule } from "./tasks/tasks.module";
import { PaymentsModule } from "./payments/payments.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { HealthModule } from "./health/health.module";
import { AuditModule } from "./audit/audit.module";
import { PlatformConfigModule } from "./platform-config/platform-config.module";
import { ProfessionalsModule } from "./professionals/professionals.module";
import { ServiceCatalogModule } from "./service-catalog/service-catalog.module";
import { DueDiligenceModule } from "./due-diligence/due-diligence.module";
import { PoaModule } from "./poa/poa.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { EscrowModule } from "./escrow/escrow.module";
import { KycModule } from "./kyc/kyc.module";
import { AdminModule } from "./admin/admin.module";
import { InspectionsModule } from "./inspections/inspections.module";
import { GuestCheckoutModule } from "./guest-checkout/guest-checkout.module";
import { EmailModule } from "./email/email.module";
import { StandaloneDdModule } from "./standalone-dd/standalone-dd.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SbrIdModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    ListingsModule,
    DocumentsModule,
    VerificationModule,
    TasksModule,
    PaymentsModule,
    TransactionsModule,
    PlatformConfigModule,
    ProfessionalsModule,
    ServiceCatalogModule,
    DueDiligenceModule,
    PoaModule,
    EscrowModule,
    KycModule,
    AdminModule,
    InspectionsModule,
    GuestCheckoutModule,
    StandaloneDdModule,
    EmailModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: MaintenanceGuard,
    },
  ],
})
export class AppModule {}
