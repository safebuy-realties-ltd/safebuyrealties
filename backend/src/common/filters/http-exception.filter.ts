import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ErrorTrackerService } from "../logging/error-tracker.service";
import { currentRequestContext } from "../logging/request-context";
import { isDevelopmentOrTest } from "../../config/runtime-environment";

/**
 * The one place an unhandled failure becomes a response, and therefore the one place worth
 * capturing it (E7-S1 criterion 3).
 *
 * What is captured is chosen by whether the failure is ours. A 404 or a 403 is the system working:
 * capturing those would bury the real faults under expected ones, and after E4-S1 there are a great
 * many expected 403s. Anything that is not an `HttpException`, and anything that resolves to 5xx,
 * is a fault and is tracked.
 *
 * The response carries the correlation id in its body as well as its header, so that a user who
 * sees an error screen can quote one string and have it match a log line exactly.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly tracker?: ErrorTrackerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred";
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
        code = this.codeFromStatus(status);
      } else if (typeof body === "object" && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string) ?? message;
        if (Array.isArray(b.message)) {
          message = (b.message as string[]).join("; ");
        }
        const errName = b.error as string | undefined;
        code =
          status === HttpStatus.BAD_REQUEST && Array.isArray(b.message)
            ? "VALIDATION_ERROR"
            : typeof errName === "string" && errName !== "Bad Request"
              ? String(errName).replace(/\s+/g, "_").toUpperCase()
              : this.codeFromStatus(status);
        if (b.details) details = b.details as Record<string, unknown>;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        status = HttpStatus.CONFLICT;
        code = "DUPLICATE";
        message = "A record with this value already exists";
      } else if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        code = "NOT_FOUND";
        message = "Record not found";
      }
    } else if (exception instanceof Error) {
      // Outside production the real message is returned so a developer is not left guessing; in
      // production it is withheld, because an unhandled message quotes internals. Either way the
      // capture below has the full text and the correlation id ties the two together.
      message = isDevelopmentOrTest() ? exception.message : message;
    }

    this.track(exception, req, status, code);

    const payload = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        // Present on every error, including the ones we did not capture: a 403 the caller thinks is
        // wrong is exactly the case where support needs to find the line.
        ...(currentRequestContext()?.correlationId
          ? { correlationId: currentRequestContext()?.correlationId }
          : {}),
      },
    };
    // E5-S1 criterion 2. The header lives here rather than in the guard because neither thing that
    // refuses a caller holds a response object: the guard throws and `AuthService` throws from three
    // layers down. Both put the number in `details.retryAfterSeconds`, and any 429 raised later gets
    // the header without its author having to remember it.
    const retryAfter = details?.retryAfterSeconds;
    if (status === HttpStatus.TOO_MANY_REQUESTS && typeof retryAfter === "number") {
      res.setHeader("Retry-After", String(retryAfter));
    }

    res.status(status).json(payload);
  }

  /**
   * Captures the faults and lets the expected outcomes past.
   *
   * A deliberate `NotFoundException` is the system answering correctly and must not compete for
   * attention with a `TypeError`. The test is the status the caller ends up with, not the class
   * that was thrown, because a Prisma error the mapping does not recognise is a 500 and belongs in
   * the tracker under its own name.
   */
  private track(exception: unknown, req: Request, status: number, code: string): void {
    const expected =
      exception instanceof HttpException && status < HttpStatus.INTERNAL_SERVER_ERROR;
    if (expected || !this.tracker) return;

    this.tracker.capture(exception, {
      source: `${req.method} ${req.route?.path ?? req.originalUrl.split("?")[0]}`,
      statusCode: status,
      // Identifiers only. The request body is not passed, is not a parameter of `capture`, and
      // would be redacted by field name if it somehow arrived.
      fields: {
        code,
        ...(exception instanceof Prisma.PrismaClientKnownRequestError
          ? { prismaCode: exception.code }
          : {}),
      },
    });
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      // E3-S2 criterion 6. `BadGatewayException` carries `error: "Bad Gateway"` and so is named from
      // that above without ever reaching here; this case is for a bare `new HttpException(msg, 502)`,
      // which would otherwise come back as the unhelpful `HTTP_ERROR`.
      case HttpStatus.BAD_GATEWAY:
        return "BAD_GATEWAY";
      default:
        return "HTTP_ERROR";
    }
  }
}
