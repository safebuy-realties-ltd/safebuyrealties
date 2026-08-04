import { ArgumentsHost, Catch, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { HttpExceptionFilter } from "./http-exception.filter";

/**
 * Turns "you are not signed in" into "there is nothing here", for the handful of routes where
 * saying the first thing would give away the second (E1-S3 criterion 3).
 *
 * A due diligence report belongs to one buyer. `GET /due-diligence-orders/:id/reports` already
 * answers 404 to a buyer who is not the owner, and the reason is written out in
 * `due-diligence-case.service.ts`: a 403 there would confirm the order exists to somebody who
 * should not know it does. That reasoning does not stop at the sign-in boundary. Leave the
 * anonymous case as a 401 and anyone can walk order ids from a logged-out browser and read the
 * difference between "not found" and "please log in", which is the same oracle by a different
 * door. So a caller who presents nothing gets the same answer as a caller who presents the wrong
 * credentials: nothing is here.
 *
 * **A broken or expired session is still a 401.** The predicate is the same one
 * `OptionalJwtAuthGuard` uses, deliberately: a caller carrying a credential has already told us
 * who they are trying to be, so answering 404 would teach them nothing they could not learn by
 * signing in again, and it would cost the interface the one message it needs to show, which is
 * "your session ran out, sign in". The convention is documented at
 * `private-document.controller.ts` and this filter narrows it rather than contradicting it: only
 * the caller with no session at all is converted.
 *
 * Applied per handler with `@UseFilters`, never globally. Nest runs a method-scoped filter over
 * exceptions thrown by that route's guards as well as its handler, which is what puts
 * `JwtAuthGuard`'s 401 in reach. Globally it would flatten every unauthenticated request in the
 * API to a 404 and leave the whole product unable to say "sign in", so the narrow mounting is the
 * point rather than an implementation detail.
 *
 * It extends the global filter rather than writing its own response. A filter that threw would
 * leave the request hanging, because nothing catches what a filter throws, and a filter that wrote
 * its own JSON would produce the one 404 in the API with no correlation id in it. Choosing the
 * answer and rendering the answer are separate jobs, and only the first one belongs here.
 */
@Catch(UnauthorizedException)
export class AnonymousNotFoundFilter extends HttpExceptionFilter {
  constructor() {
    // Declared rather than inherited so Nest has nothing to try to inject. No error tracker is
    // passed because the only two answers this filter renders are a 401 and a 404, and the parent
    // captures neither: both are the system working.
    super();
  }

  catch(exception: UnauthorizedException, host: ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<Request>();
    const hasSession = !!req.headers.authorization || !!req.cookies?.sbr_session;

    if (hasSession) {
      super.catch(exception, host);
      return;
    }
    super.catch(new NotFoundException("Due diligence order not found"), host);
  }
}
