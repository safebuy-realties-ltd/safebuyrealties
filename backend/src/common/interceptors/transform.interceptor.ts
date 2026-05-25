import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

export type ApiSuccessBody<T> = { data: T; meta?: Record<string, unknown> };

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body) => {
        if (body && typeof body === "object" && "data" in body) {
          return body;
        }
        return { data: body ?? null };
      }),
    );
  }
}
