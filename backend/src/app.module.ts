import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
