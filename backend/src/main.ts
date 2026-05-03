import { NestFactory } from "@nestjs/core";
import { ValidationPipe, RequestMethod } from "@nestjs/common";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";

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
  const configuredOrigins =
    process.env.FRONTEND_URL?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  app.enableCors({
    origin: (reqOrigin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!reqOrigin) {
        cb(null, true);
        return;
      }
      if (configuredOrigins.includes(reqOrigin)) {
        cb(null, true);
        return;
      }
      if (!isProd) {
        try {
          const { hostname } = new URL(reqOrigin);
          if (hostname === "localhost" || hostname === "127.0.0.1") {
            cb(null, true);
            return;
          }
        } catch {
          cb(null, false);
          return;
        }
      }
      cb(null, false);
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
