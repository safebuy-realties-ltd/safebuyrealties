import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp, createAppDependencies } from "./app-bootstrap";
import { installProcessErrorHandlers } from "./common/logging/error-tracker.service";
import { assertSafeDatabaseUrl } from "./config/database-guard";
import { assertCorsConfigured } from "./config/cors-config";
import { assertPaymentsConfigured } from "./config/payments-guard";
import { assertJwtSecret } from "./config/jwt-secret";
import { assertStorageConfigured } from "./config/storage-guard";
import { warnIfRuntimeEnvironmentUndeclared } from "./config/runtime-environment";

// First, because every guard below resolves the environment and this says so once when nothing
// declared it. See docs/adr/0006-deployment-target-and-runtime-environment.md.
warnIfRuntimeEnvironmentUndeclared();
assertSafeDatabaseUrl();
assertCorsConfigured();
assertPaymentsConfigured();
assertJwtSecret();
// E3-S2 criterion 1. Here rather than in StorageService's constructor because the constructor runs
// when the module graph is built, and a production instance that boots on the local driver accepts
// its first upload before anyone finds out the bytes have nowhere durable to go.
assertStorageConfigured();

async function bootstrap() {
  // Built and installed before NestFactory, because module construction can throw and a failure
  // during boot is precisely the one nobody can currently see. `useLogger` is passed as an option
  // rather than called on the app: that way the structured logger is in place for Nest's own
  // startup lines too, and `Logger.overrideLogger` — which is static, process-wide state — is never
  // touched from `configureApp`, where the specs would inherit it.
  const deps = createAppDependencies();
  installProcessErrorHandlers(deps.errorTracker);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: deps.logger,
  });
  configureApp(app, deps);
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

void bootstrap();
