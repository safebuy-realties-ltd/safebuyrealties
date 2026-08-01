import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { setRequestActor } from "./request-context";

/**
 * Records who is calling, as soon as that is known.
 *
 * `CorrelationIdMiddleware` runs before authentication and so cannot know. Its `finish` listener
 * catches up in time for the completion line, but every line a *service* writes in between would
 * still be anonymous — and those are the lines that answer "who released that escrow". Nest runs
 * interceptors after guards, which makes this the first point in the chain where `request.user`
 * exists.
 *
 * It reads and records; it does not authorize. `PermissionsGuard` has already decided by now.
 */
@Injectable()
export class RequestActorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === "http") {
      const request = context.switchToHttp().getRequest<{ user?: { sub?: string; role?: string } }>();
      setRequestActor(request.user?.sub, request.user?.role);
    }
    return next.handle();
  }
}
