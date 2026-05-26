import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ListingsModule,
    DocumentsModule,
    VerificationModule,
    TasksModule,
    PaymentsModule,
    TransactionsModule,
    HealthModule,
  ],
})
export class AppModule {}
