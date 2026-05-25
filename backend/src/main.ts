import { NestFactory } from "@nestjs/core";
import { ValidationPipe, RequestMethod } from "@nestjs/common";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";

function parseConfiguredOrigins(): string[] {
  return (
    process.env.FRONTEND_URL?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

function isAllowedCorsOrigin(origin: string, configuredOrigins: string[], isProd: boolean): boolean {
  if (configuredOrigins.includes(origin)) {
    return true;
  }

  if (!isProd) {
    try {
      const { hostname } = new URL(origin);
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return true;
      }
    } catch {
      return false;
    }
  }

  try {
    const { protocol, hostname } = new URL(origin);
    // Production + preview deploys on Vercel for this project
    if (
      protocol === "https:" &&
      hostname.endsWith(".vercel.app") &&
      hostname.includes("safebuyrealties")
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
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
  const isProd = process.env.NODE_ENV === "production";
  const configuredOrigins = parseConfiguredOrigins();
  app.enableCors({
    origin: (reqOrigin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!reqOrigin) {
        cb(null, true);
        return;
      }
      cb(null, isAllowedCorsOrigin(reqOrigin, configuredOrigins, isProd));
    },
    credentials: true,
  });
  app.setGlobalPrefix("api/v1", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

void bootstrap();
