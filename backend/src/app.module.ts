import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { SbrIdModule } from "./sbr-id/sbr-id.module";
import { MaintenanceGuard } from "./common/guards/maintenance.guard";
import { FeatureGuard } from "./common/guards/feature.guard";
import { ThrottleGuard } from "./common/guards/throttle.guard";
import { FeatureFlagsModule } from "./feature-flags/feature-flags.module";
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
import { PermissionsModule } from "./permissions/permissions.module";
import { DdCmsModule } from "./dd-cms/dd-cms.module";
import { AdminRolesModule } from "./admin-roles/admin-roles.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SbrIdModule,
    AuditModule,
    FeatureFlagsModule,
    NotificationsModule,
    PermissionsModule,
    DdCmsModule,
    AdminRolesModule,
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
    {
      // Global so that `@RequiresFeature` is the whole of what a story author writes. A route
      // without the decorator costs one Reflector lookup and passes.
      provide: APP_GUARD,
      useClass: FeatureGuard,
    },
    {
      // Third and last, so a request refused by maintenance or by a dark feature is never also
      // counted against a limit it was never going to reach. `@Throttle` picks a policy and
      // `@SkipThrottle` opts out; everything else falls to the global default.
      provide: APP_GUARD,
      useClass: ThrottleGuard,
    },
  ],
})
export class AppModule {}
