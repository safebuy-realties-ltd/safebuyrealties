import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { correlationIdMiddleware } from "./common/logging/correlation-id.middleware";
import { ErrorTrackerService } from "./common/logging/error-tracker.service";
import { RequestActorInterceptor } from "./common/logging/request-actor.interceptor";
import { StructuredLogger } from "./common/logging/structured-logger.service";
import { buildCorsOptions } from "./config/cors-config";

/**
 * Everything bootstrap() applies to the app between NestFactory.create() and listen().
 *
 * Extracted from main.ts so a test can exercise the real middleware order rather than a
 * hand-copied replica of it. The environment guards (assertSafeDatabaseUrl and friends) stay
 * at main.ts's top level on purpose: they call process.exit(), which a test must never trigger
 * merely by importing this module.
 *
 * **There is no `/uploads` static mount here any more, and there must never be one again.**
 * E3-S1a found it serving title deeds, government IDs and KYC selfies to anyone holding a key,
 * because Express middleware registered here runs ahead of the Nest router and no guard on any
 * controller can reach that far. E3-S1b put a category gate in front of it as a stop-gap; E3-S1c,
 * E3-S1d-1 and E3-S1d-2 moved the private families onto an authorized Nest route; E3-S1d-3 moved
 * the last one, `listings/`, and deleted both the mount and the gate. Stored objects are now
 * served only by `PrivateDocumentController`, which decides per request who is asking.
 * `uploads-exposure.spec.ts` fails if a mount reappears.
 */

/**
 * The logger and the error tracker, built once and shared.
 *
 * They are plain constructions rather than Nest providers because two of the three things that use
 * them run outside the container: `app.useLogger()` is set before the first module resolves, and the
 * process-level handlers in `main.ts` must be installed before anything can throw. Sharing one
 * instance matters — `ErrorTrackerService` counts occurrences per fingerprint, and a second instance
 * would count the same crash loop twice from zero.
 */
export interface AppDependencies {
  logger: StructuredLogger;
  errorTracker: ErrorTrackerService;
}

export function createAppDependencies(): AppDependencies {
  const logger = new StructuredLogger();
  return { logger, errorTracker: new ErrorTrackerService(logger) };
}

export function configureApp(
  app: NestExpressApplication,
  deps: AppDependencies = createAppDependencies(),
): void {
  // First, and before cookieParser: a request that dies in parsing still deserves an id, and that
  // is the failure someone will most want to trace. See correlation-id.middleware.ts.
  app.use(correlationIdMiddleware(deps.logger));
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
  app.useGlobalFilters(new HttpExceptionFilter(deps.errorTracker));
  // The actor interceptor runs first so that anything the transform or the handler logs already
  // knows who is calling.
  app.useGlobalInterceptors(new RequestActorInterceptor(), new TransformInterceptor());
  app.enableCors(buildCorsOptions());
  app.setGlobalPrefix("api/v1");
}
