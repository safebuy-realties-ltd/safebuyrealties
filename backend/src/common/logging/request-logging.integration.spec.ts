import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Body, Controller, Get, Inject, NotFoundException, Post } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureApp } from "../../app-bootstrap";
import { CORRELATION_HEADER } from "./correlation-id.middleware";
import { ErrorTrackerService } from "./error-tracker.service";
import { StructuredLogger } from "./structured-logger.service";

/**
 * E7-S1, end to end through the real `configureApp`.
 *
 * The unit specs prove each part in isolation, which is exactly the arrangement that can pass while
 * the middleware is mounted in the wrong place, or after the response has already been sent. This
 * builds a real Nest application with the real bootstrap, drives it with real HTTP, and reads the
 * bytes the logger actually wrote.
 *
 * Criteria covered here: 1 (id per request, on every line, returned in a header), 2 (structured JSON
 * with a consistent field set), 3 (faults captured with id, route and role, never the body),
 * 4 (redaction, on the path a real request takes).
 */

const PROBE_LOGGER = Symbol("PROBE_LOGGER");
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller("probe")
class ProbeController {
  constructor(@Inject(PROBE_LOGGER) private readonly logger: StructuredLogger) {}

  @Get("work")
  work() {
    // A service logging a sentence, knowing nothing about HTTP. The id has to arrive anyway.
    this.logger.write("log", "did some work", { context: "ProbeService" });
    return { ok: true };
  }

  @Get("boom")
  boom() {
    throw new Error("kaboom in the handler");
  }

  @Get("missing")
  missing() {
    throw new NotFoundException("no such listing");
  }

  @Post("submit")
  submit(@Body() body: unknown) {
    this.logger.write("log", "submission received", { context: "ProbeService", body });
    throw new Error("could not save the submission");
  }
}

describe("request logging through configureApp (E7-S1)", () => {
  let app: NestExpressApplication;
  let logger: StructuredLogger;
  let tracker: ErrorTrackerService;
  let capture: jest.SpyInstance;
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;

  beforeAll(async () => {
    // The logger reads its format and level once, at construction. JSON is what production emits and
    // what this file needs to parse, so it is built under production's settings rather than the
    // runner's.
    const saved = { format: process.env.LOG_FORMAT, level: process.env.LOG_LEVEL };
    process.env.LOG_FORMAT = "json";
    process.env.LOG_LEVEL = "log";
    logger = new StructuredLogger();
    if (saved.format === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = saved.format;
    if (saved.level === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = saved.level;

    tracker = new ErrorTrackerService(logger);

    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [{ provide: PROBE_LOGGER, useValue: logger }],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, { logger, errorTracker: tracker });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    capture = jest.spyOn(tracker, "capture");
    stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Every line both streams received during the test, parsed. */
  const written = (): Record<string, unknown>[] =>
    [...stdout.mock.calls, ...stderr.mock.calls].map(
      ([line]) => JSON.parse(String(line)) as Record<string, unknown>,
    );

  const rawWritten = (): string =>
    [...stdout.mock.calls, ...stderr.mock.calls].map(([line]) => String(line)).join("");

  describe("criterion 1, the id", () => {
    it("returns a generated id in the response header", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/probe/work");

      expect(response.status).toBe(200);
      expect(response.headers[CORRELATION_HEADER]).toMatch(UUID_V4);
    });

    it("echoes the id the caller supplied, so a trace spans both services", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/probe/work")
        .set(CORRELATION_HEADER, "frontend-trace-01");

      expect(response.headers[CORRELATION_HEADER]).toBe("frontend-trace-01");
    });

    it("replaces an id it will not vouch for", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/probe/work")
        .set(CORRELATION_HEADER, "spoofed id!");

      expect(response.headers[CORRELATION_HEADER]).not.toBe("spoofed id!");
      expect(response.headers[CORRELATION_HEADER]).toMatch(UUID_V4);
    });

    it("attaches the id to a line the handler logged and to the access line alike", async () => {
      await request(app.getHttpServer()).get("/api/v1/probe/work").set(CORRELATION_HEADER, "frontend-trace-02");

      const lines = written();
      const handler = lines.find((line) => line.msg === "did some work");
      const access = lines.find((line) => line.msg === "request completed");

      expect(handler).toMatchObject({
        correlationId: "frontend-trace-02",
        method: "GET",
        path: "/api/v1/probe/work",
        context: "ProbeService",
      });
      expect(access).toMatchObject({
        correlationId: "frontend-trace-02",
        method: "GET",
        path: "/api/v1/probe/work",
        statusCode: 200,
        context: "HTTP",
      });
    });

    it("returns the id in the error body as well, so a user can quote it in a ticket", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/probe/boom");

      expect(response.status).toBe(500);
      expect(response.body.error.correlationId).toBe(response.headers[CORRELATION_HEADER]);
    });

    it("keeps two requests apart", async () => {
      const [first, second] = await Promise.all([
        request(app.getHttpServer()).get("/api/v1/probe/work").set(CORRELATION_HEADER, "trace-alpha-1"),
        request(app.getHttpServer()).get("/api/v1/probe/work").set(CORRELATION_HEADER, "trace-bravo-1"),
      ]);

      expect(first.headers[CORRELATION_HEADER]).toBe("trace-alpha-1");
      expect(second.headers[CORRELATION_HEADER]).toBe("trace-bravo-1");

      const handlers = written().filter((line) => line.msg === "did some work");
      expect(handlers.map((line) => line.correlationId).sort()).toEqual(["trace-alpha-1", "trace-bravo-1"]);
    });
  });

  describe("criterion 2, the shape", () => {
    it("writes one JSON object per line with the same fields every time", async () => {
      await request(app.getHttpServer()).get("/api/v1/probe/work");

      for (const call of stdout.mock.calls) {
        const line = String(call[0]);
        expect(line.endsWith("\n")).toBe(true);
        expect(() => JSON.parse(line)).not.toThrow();
      }

      const access = written().find((line) => line.msg === "request completed");
      expect(Object.keys(access ?? {}).sort()).toEqual(
        ["context", "correlationId", "durationMs", "level", "method", "msg", "path", "statusCode", "ts"].sort(),
      );
    });

    it("records a fault on stderr and ordinary traffic on stdout", async () => {
      await request(app.getHttpServer()).get("/api/v1/probe/boom");

      const errorLines = stderr.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
      expect(errorLines.some((line) => line.event === "error.captured")).toBe(true);
      expect(stdout.mock.calls).toHaveLength(0);
    });
  });

  describe("criterion 3, the tracker", () => {
    it("captures a handler fault with the route, the status and the id", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/probe/boom");

      expect(capture).toHaveBeenCalledTimes(1);
      const event = capture.mock.results[0].value as Record<string, unknown>;
      expect(event).toMatchObject({
        event: "error.captured",
        message: "kaboom in the handler",
        statusCode: 500,
        method: "GET",
        path: "/api/v1/probe/boom",
        correlationId: response.headers[CORRELATION_HEADER],
      });
      expect(String(event.source)).toContain("/probe/boom");
    });

    it("does not capture an expected outcome", async () => {
      // A 404 is the system working. Capturing those buries the real faults, and after E4-S1 there
      // are a great many deliberate 403s besides.
      const response = await request(app.getHttpServer()).get("/api/v1/probe/missing");

      expect(response.status).toBe(404);
      expect(capture).not.toHaveBeenCalled();
    });

    it("logs the access line for a fault at error level", async () => {
      await request(app.getHttpServer()).get("/api/v1/probe/boom");

      const access = written().find((line) => line.msg === "request completed");
      expect(access).toMatchObject({ level: "error", statusCode: 500 });
    });
  });

  describe("the order the middleware is mounted in", () => {
    // Asserted against the source, which is a poor second to asserting against behaviour and is
    // done here only because the behaviour is unreachable: neither cookieParser nor helmet can be
    // made to fail by anything a client is able to send, so no request can demonstrate the
    // difference. The claim is still worth pinning — the reason correlation goes first is the
    // request that dies *before* the router, and the day some earlier middleware does start
    // throwing is exactly the day nobody re-reads the comment explaining the order.
    it("puts the correlation middleware ahead of everything else in configureApp", () => {
      const bootstrap = readFileSync(join(__dirname, "..", "..", "app-bootstrap.ts"), "utf8");
      const positionOf = (needle: string) => {
        const at = bootstrap.indexOf(needle);
        expect(at).toBeGreaterThan(-1);
        return at;
      };

      const correlation = positionOf("app.use(correlationIdMiddleware(");
      expect(correlation).toBeLessThan(positionOf("app.use(cookieParser("));
      expect(correlation).toBeLessThan(positionOf("helmet({"));
    });
  });

  describe("criterion 4, redaction on a real request", () => {
    it("never writes a submitted password or token to the stream, nor into a capture", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/probe/submit")
        .set(CORRELATION_HEADER, "trace-submit-01")
        .send({
          email: "buyer@example.com",
          password: "hunter2",
          accountNumber: "0123456789",
          note: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXZhbHVl",
        });

      expect(response.status).toBe(500);

      const stream = rawWritten();
      expect(stream).toContain("trace-submit-01");
      expect(stream).not.toContain("hunter2");
      expect(stream).not.toContain("0123456789");
      expect(stream).not.toContain("eyJhbGciOiJIUzI1NiJ9");

      const event = capture.mock.results[0].value as Record<string, unknown>;
      expect(JSON.stringify(event)).not.toContain("hunter2");
      expect(event).not.toHaveProperty("body");
    });
  });
});
