import { EventEmitter } from "node:events";
import { Request, Response } from "express";
import {
  CORRELATION_HEADER,
  correlationIdMiddleware,
  readCorrelationId,
} from "./correlation-id.middleware";
import { RequestContext, currentRequestContext } from "./request-context";
import { StructuredLogger } from "./structured-logger.service";

/**
 * E7-S1 criterion 1: "A correlation id is generated or accepted per request, attached to every log
 * line, and returned in a response header."
 *
 * The logger is a stub here on purpose. What this file is responsible for is the id, the header, the
 * context and the access line; whether those fields survive to stdout is `structured-logger.service.spec.ts`,
 * and whether the whole chain works through the real `configureApp` is `request-logging.integration.spec.ts`.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fakeReq(
  init: { method?: string; url?: string; headers?: Record<string, string | string[]> } = {},
): Request {
  return {
    method: init.method ?? "GET",
    originalUrl: init.url ?? "/api/v1/listings",
    headers: init.headers ?? {},
  } as unknown as Request;
}

function fakeRes() {
  const emitter = new EventEmitter();
  const headers: Record<string, string> = {};
  const res = emitter as unknown as Response;
  res.statusCode = 200;
  res.setHeader = ((name: string, value: string) => {
    headers[String(name).toLowerCase()] = String(value);
    return res;
  }) as Response["setHeader"];

  return {
    res,
    headers,
    finish(status = 200) {
      res.statusCode = status;
      emitter.emit("finish");
    },
  };
}

describe("readCorrelationId", () => {
  it("accepts an id the caller supplied", () => {
    expect(readCorrelationId(fakeReq({ headers: { "x-request-id": "req-abc-123" } }))).toBe(
      "req-abc-123",
    );
  });

  it("prefers x-request-id and falls back to x-correlation-id", () => {
    expect(
      readCorrelationId(
        fakeReq({ headers: { "x-request-id": "primary-id", "x-correlation-id": "secondary-id" } }),
      ),
    ).toBe("primary-id");
    expect(readCorrelationId(fakeReq({ headers: { "x-correlation-id": "secondary-id" } }))).toBe(
      "secondary-id",
    );
  });

  it("takes the first value when a header arrives repeated", () => {
    expect(
      readCorrelationId(fakeReq({ headers: { "x-request-id": ["first-id-x", "second"] } })),
    ).toBe("first-id-x");
  });

  it("generates one when the caller supplies nothing", () => {
    const id = readCorrelationId(fakeReq());
    expect(id).toMatch(UUID_V4);
  });

  it("refuses a hostile id rather than echoing it into a header and a log", () => {
    // This value reaches a response header and the log stream at once. A CRLF would split the
    // header; the newline forms would let a client forge log entries around its own request.
    const hostile = [
      "abcdefgh\r\nSet-Cookie: a=b",
      "abcdefgh\ninjected line",
      "short",
      `${"x".repeat(129)}`,
      "has spaces here",
      "slash/es/and%20escapes",
      '"quoted-value"',
      "<script>alert(1)</script>",
    ];

    for (const candidate of hostile) {
      const id = readCorrelationId(fakeReq({ headers: { "x-request-id": candidate } }));
      expect(id).not.toBe(candidate);
      expect(id).toMatch(UUID_V4);
    }
  });

  it("accepts the alphabets real infrastructure emits", () => {
    for (const candidate of [
      "550e8400-e29b-41d4-a716-446655440000",
      "1-63f9a1b2-0123456789abcdef01234567",
      "trace_id.span:01",
      "AbCdEfGh",
      "x".repeat(128),
    ]) {
      expect(readCorrelationId(fakeReq({ headers: { "x-request-id": candidate } }))).toBe(
        candidate,
      );
    }
  });
});

describe("correlationIdMiddleware", () => {
  let write: jest.Mock;
  let logger: StructuredLogger;

  beforeEach(() => {
    write = jest.fn();
    logger = { write } as unknown as StructuredLogger;
  });

  it("returns the id in a response header", () => {
    const { res, headers } = fakeRes();
    correlationIdMiddleware(logger)(
      fakeReq({ headers: { "x-request-id": "given-id-1" } }),
      res,
      jest.fn(),
    );

    expect(headers[CORRELATION_HEADER]).toBe("given-id-1");
  });

  it("puts the request in scope for everything downstream", () => {
    const { res } = fakeRes();
    let seen: RequestContext | undefined;
    correlationIdMiddleware(logger)(
      fakeReq({
        method: "POST",
        url: "/api/v1/payments/initiate",
        headers: { "x-request-id": "given-id-2" },
      }),
      res,
      () => {
        seen = currentRequestContext();
      },
    );

    expect(seen).toMatchObject({
      correlationId: "given-id-2",
      method: "POST",
      path: "/api/v1/payments/initiate",
    });
  });

  it("keeps the query string out of the context", () => {
    // Reset and verify links carry their token in the query string. A path is enough to identify a
    // route and cannot leak one.
    const { res } = fakeRes();
    let seen: RequestContext | undefined;
    correlationIdMiddleware(logger)(
      fakeReq({ url: "/api/v1/auth/verify?token=eyJhbGciOiJIUzI1NiJ9.abc.def" }),
      res,
      () => {
        seen = currentRequestContext();
      },
    );

    expect(seen?.path).toBe("/api/v1/auth/verify");
  });

  it("logs nothing until the response finishes", () => {
    const { res, finish } = fakeRes();
    correlationIdMiddleware(logger)(fakeReq(), res, jest.fn());
    expect(write).not.toHaveBeenCalled();

    finish(200);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("writes the access line inside the request context", async () => {
    // `finish` fires from a tick scheduled by whoever ended the response, which is downstream of
    // `next()` and therefore inside the context. Asserting it across a real tick boundary is the
    // point: a listener registered outside `runInRequestContext` would produce a line with no id.
    const { res, finish } = fakeRes();
    let seen: RequestContext | undefined;
    write.mockImplementation(() => {
      seen = currentRequestContext();
    });

    correlationIdMiddleware(logger)(
      fakeReq({ headers: { "x-request-id": "given-id-3" } }),
      res,
      () => {
        process.nextTick(() => finish(200));
      },
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen?.correlationId).toBe("given-id-3");
  });

  it("records the outcome and how long it took", () => {
    const { res, finish } = fakeRes();
    correlationIdMiddleware(logger)(fakeReq(), res, jest.fn());
    finish(201);

    const [level, msg, fields] = write.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(level).toBe("log");
    expect(msg).toBe("request completed");
    expect(fields).toMatchObject({ context: "HTTP", statusCode: 201 });
    expect(typeof fields.durationMs).toBe("number");
    expect(fields.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it("raises the level with the status class", () => {
    for (const [status, level] of [
      [200, "log"],
      [302, "log"],
      [400, "warn"],
      [401, "warn"],
      [403, "warn"],
      [404, "warn"],
      [500, "error"],
      [503, "error"],
    ] as const) {
      write.mockClear();
      const { res, finish } = fakeRes();
      correlationIdMiddleware(logger)(fakeReq(), res, jest.fn());
      finish(status);

      expect(write.mock.calls[0][0]).toBe(level);
    }
  });

  it("picks up the actor a guard attached after it had already returned", async () => {
    // The whole reason this is a `finish` listener: authentication happens between `next()` and the
    // response, and a 403 never reaches an interceptor at all.
    const { res, finish } = fakeRes();
    const req = fakeReq();
    let seen: RequestContext | undefined;
    write.mockImplementation(() => {
      seen = currentRequestContext();
    });

    correlationIdMiddleware(logger)(req, res, () => {
      (req as Request & { user?: unknown }).user = { sub: "user-77", role: "AGENT" };
      process.nextTick(() => finish(403));
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen).toMatchObject({ userId: "user-77", role: "AGENT" });
    expect(write.mock.calls[0][0]).toBe("warn");
  });

  it("leaves the actor unset for an anonymous request", async () => {
    const { res, finish } = fakeRes();
    let seen: RequestContext | undefined;
    write.mockImplementation(() => {
      seen = currentRequestContext();
    });

    correlationIdMiddleware(logger)(fakeReq(), res, () => {
      process.nextTick(() => finish(401));
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen?.userId).toBeUndefined();
    expect(seen?.role).toBeUndefined();
  });

  it("gives two overlapping requests two different ids", async () => {
    // AsyncLocalStorage is the reason this holds. A module-level "current request" variable would
    // pass every other test in this file and fail this one: both middlewares have returned before
    // either response finishes, so a single shared slot would hold the second id for both lines.
    const first = fakeRes();
    const second = fakeRes();
    const middleware = correlationIdMiddleware(logger);
    const seen: (string | undefined)[] = [];
    write.mockImplementation(() => {
      seen.push(currentRequestContext()?.correlationId);
    });

    middleware(fakeReq({ headers: { "x-request-id": "request-one" } }), first.res, () => {
      process.nextTick(() => first.finish(200));
    });
    middleware(fakeReq({ headers: { "x-request-id": "request-two" } }), second.res, () => {
      process.nextTick(() => second.finish(200));
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen).toEqual(["request-one", "request-two"]);
  });
});
