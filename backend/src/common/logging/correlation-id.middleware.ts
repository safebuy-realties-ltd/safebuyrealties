import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { StructuredLogger } from "./structured-logger.service";
import { runInRequestContext, setRequestActor } from "./request-context";

/**
 * E7-S1 criterion 1: one id per request, on every line it produces, and handed back to the caller.
 *
 * Registered as plain Express middleware rather than Nest middleware so that it is the outermost
 * thing in the chain. A Nest middleware runs after everything `configureApp` mounts with `app.use`,
 * which would leave a `cookieParser` or `helmet` failure logged with no id at all — exactly the
 * failure someone would most want to trace.
 *
 * The completion line is emitted from a `finish` listener, not from an interceptor, because an
 * interceptor never runs for a request a guard rejected. A 403 is a thing worth having in the access
 * log, and under E4-S1 there are now considerably more of them.
 */

/** Response header carrying the id back. `x-request-id` is what Render, Cloudflare and curl expect. */
export const CORRELATION_HEADER = "x-request-id";

/** Accepted inbound aliases, in order of preference. */
const INBOUND_HEADERS = ["x-request-id", "x-correlation-id"];

/**
 * A caller-supplied id is echoed into a response header and into every log line, so it is untrusted
 * input at two sinks at once. Restricting it to this alphabet blocks header splitting (`\r\n`) and
 * keeps a hostile client from forging plausible-looking log entries around its own request.
 */
const SAFE_ID = /^[A-Za-z0-9_.:-]{8,128}$/;

export function readCorrelationId(req: Request): string {
  for (const header of INBOUND_HEADERS) {
    const raw = req.headers[header];
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    if (typeof candidate === "string" && SAFE_ID.test(candidate)) return candidate;
  }
  return randomUUID();
}

/** Status classes worth more than an info line. 5xx is ours; 4xx is theirs but still notable. */
function levelFor(status: number): "log" | "warn" | "error" {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "log";
}

export function correlationIdMiddleware(logger: StructuredLogger) {
  return function correlationId(req: Request, res: Response, next: NextFunction): void {
    const id = readCorrelationId(req);
    res.setHeader(CORRELATION_HEADER, id);

    // `originalUrl` carries the query string, which routinely holds tokens on reset and verify
    // links. The path alone is what identifies the route.
    const path = req.originalUrl.split("?")[0];
    const startedAt = process.hrtime.bigint();

    runInRequestContext({ correlationId: id, method: req.method, path }, () => {
      res.on("finish", () => {
        // The guards populate `req.user` after this middleware has returned but before the response
        // finishes, so this is the earliest point at which the actor is known for *every* outcome,
        // including the ones no interceptor sees.
        const user = (req as Request & { user?: { sub?: string; role?: string } }).user;
        setRequestActor(user?.sub, user?.role);

        logger.write(levelFor(res.statusCode), "request completed", {
          context: "HTTP",
          statusCode: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        });
      });

      next();
    });
  };
}
