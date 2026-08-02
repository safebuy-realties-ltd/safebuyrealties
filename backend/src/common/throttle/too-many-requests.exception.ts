import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * The one 429 this application throws, from either tier.
 *
 * `@nestjs/common` has no exception for this status, and the important part is not the class but
 * the shape: `details.retryAfterSeconds` is what `HttpExceptionFilter` turns into the `Retry-After`
 * header. Putting it here rather than setting the header at each throw site means the guard and the
 * account lockout cannot disagree about it, and it means a 429 raised by anything written later
 * carries the header without its author having to know that.
 *
 * The number is in the body as well as the header on purpose. A browser client reading a JSON error
 * envelope can say "try again in four minutes" without reaching for the response headers, which
 * CORS would have to expose to it first.
 */
export class TooManyRequestsException extends HttpException {
  constructor(message: string, retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: "Too Many Requests",
        message,
        details: { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)) },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
