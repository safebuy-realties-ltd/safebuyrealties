import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./app-bootstrap";
import { assertSafeDatabaseUrl } from "./config/database-guard";
import { assertCorsConfigured } from "./config/cors-config";
import { assertPaymentsConfigured } from "./config/payments-guard";
import { assertJwtSecret } from "./config/jwt-secret";

assertSafeDatabaseUrl();
assertCorsConfigured();
assertPaymentsConfigured();
assertJwtSecret();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  configureApp(app);
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

void bootstrap();
