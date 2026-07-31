import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import * as express from "express";
import * as path from "path";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { buildCorsOptions } from "./config/cors-config";
import { PrismaService } from "./prisma/prisma.service";
import { createPublicListingAssetGate } from "./storage/public-listing-asset.gate";

/**
 * Everything bootstrap() applies to the app between NestFactory.create() and listen().
 *
 * Extracted from main.ts so a test can exercise the real middleware order rather than a
 * hand-copied replica of it. The environment guards (assertSafeDatabaseUrl and friends) stay
 * at main.ts's top level on purpose: they call process.exit(), which a test must never trigger
 * merely by importing this module.
 */

export function resolveUploadRoot(): string {
  const configured = process.env.STORAGE_LOCAL_PATH?.trim() || process.env.UPLOAD_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve("./uploads");
}

export function configureApp(app: NestExpressApplication): void {
  // E3-S1b: this mount is Express-level middleware registered ahead of the Nest router, so no
  // guard on any controller can reach it — before the gate, any storage key fetched a title
  // deed, a government ID or a KYC selfie with no session (E3-S1a,
  // src/storage/uploads-exposure.spec.ts). The gate resolves each key to its Document row and
  // passes only public listing imagery on a publicly visible listing; everything else is 404.
  // It closes the exposure, it does not authorize anything: the authorized path for private
  // documents is still E3-S1.
  app.use(
    "/uploads",
    createPublicListingAssetGate(app.get(PrismaService)),
    express.static(resolveUploadRoot()),
  );
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: false, // API only; CSP enforced at the frontend
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.enableCors(buildCorsOptions());
  app.setGlobalPrefix("api/v1");
}
