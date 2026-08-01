import { ErrorTrackerService, installProcessErrorHandlers } from "./error-tracker.service";
import { runInRequestContext } from "./request-context";
import { StructuredLogger } from "./structured-logger.service";
import { REDACTED } from "./redact";

/**
 * E7-S1 criterion 3: "An error tracker captures unhandled exceptions with the correlation id, the
 * route, and the role, and never the request body."
 *
 * The "never the request body" half is asserted structurally rather than by example, because an
 * example only proves that today's callers behave. `capture` has no parameter that could carry a
 * body, and the test that pins its arity is what stops one being added.
 */
describe("ErrorTrackerService", () => {
  let write: jest.Mock;
  let logger: StructuredLogger;
  let tracker: ErrorTrackerService;

  beforeEach(() => {
    write = jest.fn();
    logger = { write } as unknown as StructuredLogger;
    tracker = new ErrorTrackerService(logger);
  });

  describe("what a capture carries", () => {
    it("records the correlation id, the route and the role from the request in flight", () => {
      const event = runInRequestContext(
        {
          correlationId: "77777777-8888-9999-aaaa-bbbbbbbbbbbb",
          method: "POST",
          path: "/api/v1/escrow/release",
          userId: "user-3",
          role: "ADMIN",
        },
        () => tracker.capture(new Error("prisma down"), { source: "EscrowService.release", statusCode: 500 }),
      );

      expect(event).toMatchObject({
        event: "error.captured",
        source: "EscrowService.release",
        name: "Error",
        message: "prisma down",
        statusCode: 500,
        correlationId: "77777777-8888-9999-aaaa-bbbbbbbbbbbb",
        method: "POST",
        path: "/api/v1/escrow/release",
        userId: "user-3",
        role: "ADMIN",
      });
      expect(event?.stack).toContain("error-tracker.service.spec.ts");
    });

    it("has no parameter that could carry a request body", () => {
      // Two arguments: the error, and a context whose only free-form slot is `fields`, which is
      // redacted. Adding a third would fail here before it could reach a log drain.
      expect(ErrorTrackerService.prototype.capture).toHaveLength(2);
    });

    it("redacts the extra fields and the message a caller does supply", () => {
      const event = tracker.capture(new Error("charge for 0123456789 declined"), {
        source: "PaymentsService.verify",
        fields: { reference: "sbr_1", authorization: "Bearer sk_live_x", password: "p" },
      });

      expect(event?.message).toBe("charge for [redacted:6789] declined");
      expect(event).toMatchObject({ reference: "sbr_1", authorization: REDACTED, password: REDACTED });
    });

    it("wraps a thrown non-Error so the shape stays constant", () => {
      const event = tracker.capture("something went wrong", { source: "worker" });
      expect(event).toMatchObject({ name: "Error", message: "something went wrong" });
    });

    it("writes the failure to the log with the source as its context", () => {
      tracker.capture(new RangeError("out of range"), { source: "PayoutsService.settle" });

      const [level, msg, fields] = write.mock.calls[0] as [string, string, Record<string, unknown>];
      expect(level).toBe("error");
      expect(msg).toBe("RangeError: out of range");
      expect(fields).toMatchObject({ context: "PayoutsService.settle", event: "error.captured" });
    });

    it("never throws out of the error path", () => {
      // An exception raised while reporting an exception replaces a diagnosable fault with an
      // undiagnosable one, so `capture` gives up quietly instead.
      const hostile = {
        toString() {
          throw new Error("no string for you");
        },
      };

      expect(() => tracker.capture(hostile, { source: "worker" })).not.toThrow();
      expect(tracker.capture(hostile, { source: "worker" })).toBeUndefined();
    });
  });

  describe("grouping", () => {
    // One factory, so every error below is thrown from the same line and the frame is held constant.
    // Constructing them inline would vary the stack as well as the message and prove nothing about
    // either.
    const notFound = (id: string) => new Error(`Record ${id} not found`);

    it("gives one fingerprint to failures that differ only in their numbers", () => {
      const first = tracker.capture(notFound("41"), { source: "s" });
      const second = tracker.capture(notFound("42"), { source: "s" });

      expect(second?.fingerprint).toBe(first?.fingerprint);
    });

    it("collapses two uuids into one group", () => {
      // Uuids are substituted before digits are, so an id survives as a single `<uuid>` token rather
      // than being shredded into five `<n>`s that happen to line up.
      const first = tracker.capture(notFound("550e8400-e29b-41d4-a716-446655440000"), { source: "s" });
      const second = tracker.capture(notFound("6ba7b810-9dad-11d1-80b4-00c04fd430c8"), { source: "s" });

      expect(second?.fingerprint).toBe(first?.fingerprint);
    });

    it("collapses the quoted value out of a constraint violation", () => {
      // Prisma names the offending value in the message, so without this every duplicate signup
      // would be its own incident.
      const duplicate = (email: string) => new Error(`Unique constraint failed on "${email}"`);
      const first = tracker.capture(duplicate("a@example.com"), { source: "s" });
      const second = tracker.capture(duplicate("b@example.com"), { source: "s" });

      expect(second?.fingerprint).toBe(first?.fingerprint);
    });

    it("separates failures that differ in name or in wording", () => {
      // Same held-constant frame, so the name and the message are the only variables left.
      const frame = new Error("template").stack;
      const at = (error: Error) => Object.assign(error, { stack: frame });
      const one = tracker.capture(at(new Error("Record not found")), { source: "s" });
      const two = tracker.capture(at(new TypeError("Record not found")), { source: "s" });
      const three = tracker.capture(at(new Error("Connection refused")), { source: "s" });

      expect(new Set([one?.fingerprint, two?.fingerprint, three?.fingerprint]).size).toBe(3);
    });

    it("separates the same message thrown from two different places", () => {
      // Two call sites raising "not found" are two faults to fix, not one. The first frame below the
      // framework is what tells them apart.
      const here = tracker.capture(new Error("Record 1 not found"), { source: "s" });
      const there = tracker.capture(notFound("1"), { source: "s" });

      expect(there?.fingerprint).not.toBe(here?.fingerprint);
    });

    it("counts occurrences so a crash loop reads as one incident", () => {
      expect(tracker.capture(notFound("1"), { source: "s" })?.occurrences).toBe(1);
      expect(tracker.capture(notFound("1"), { source: "s" })?.occurrences).toBe(2);
      expect(tracker.capture(notFound("2"), { source: "s" })?.occurrences).toBe(3);

      const counters = tracker.counters();
      expect([...counters.values()]).toEqual([3]);
    });

    it("hands out a copy of the counters, not the live map", () => {
      const error = new Error("boom");
      tracker.capture(error, { source: "s" });
      const snapshot = tracker.counters();
      tracker.capture(error, { source: "s" });

      expect([...snapshot.values()]).toEqual([1]);
      expect([...tracker.counters().values()]).toEqual([2]);
    });
  });

  describe("forwarding", () => {
    let fetchSpy: jest.SpyInstance;
    let savedUrl: string | undefined;

    beforeEach(() => {
      savedUrl = process.env.ERROR_TRACKER_WEBHOOK_URL;
      process.env.ERROR_TRACKER_WEBHOOK_URL = "https://tracker.example/ingest";
      fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    });

    afterEach(() => {
      if (savedUrl === undefined) delete process.env.ERROR_TRACKER_WEBHOOK_URL;
      else process.env.ERROR_TRACKER_WEBHOOK_URL = savedUrl;
      jest.restoreAllMocks();
    });

    it("posts the captured event as JSON", async () => {
      tracker.capture(new Error("first of its kind"), { source: "s" });
      await Promise.resolve();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://tracker.example/ingest");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toMatchObject({
        event: "error.captured",
        message: "first of its kind",
      });
      expect(init.signal).toBeDefined();
    });

    it("thins out a flood instead of forwarding every repeat", () => {
      // 1st, 2nd, 5th, 10th, 20th and 50th. A restart loop at ten a second must not become ten
      // outbound requests a second on top of it.
      const error = new Error("same failure every time");
      for (let i = 0; i < 50; i += 1) tracker.capture(error, { source: "s" });

      expect(fetchSpy).toHaveBeenCalledTimes(6);
      const occurrences = fetchSpy.mock.calls.map(
        ([, init]) => (JSON.parse(String((init as RequestInit).body)) as { occurrences: number }).occurrences,
      );
      expect(occurrences).toEqual([1, 2, 5, 10, 20, 50]);
    });

    it("stays quiet when no drain is configured", () => {
      delete process.env.ERROR_TRACKER_WEBHOOK_URL;
      tracker.capture(new Error("boom"), { source: "s" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("degrades to a warning when the drain is down", async () => {
      // Failing to report a fault is not itself a fault worth recursing on: an error-level line here
      // would be captured, forwarded, fail again, and loop.
      fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
      expect(() => tracker.capture(new Error("boom"), { source: "s" })).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));

      const levels = write.mock.calls.map(([level]) => level);
      expect(levels).toEqual(["error", "warn"]);
      expect(write.mock.calls[1][1]).toBe("error tracker forward failed");
    });
  });

  describe("installProcessErrorHandlers", () => {
    it("captures a rejection nobody awaited and unregisters cleanly", () => {
      const before = process.listeners("unhandledRejection").length;
      const dispose = installProcessErrorHandlers(tracker);
      const listeners = process.listeners("unhandledRejection");
      expect(listeners).toHaveLength(before + 1);

      // Invoked directly rather than emitted on the real process, so the runner's own handlers are
      // left out of it.
      listeners[listeners.length - 1](new Error("nobody awaited this"), Promise.resolve());

      expect(write.mock.calls[0][2]).toMatchObject({ source: "process.unhandledRejection" });
      dispose();
      expect(process.listeners("unhandledRejection")).toHaveLength(before);
    });

    it("captures an uncaught exception, marks the exit code and unregisters cleanly", () => {
      const savedExitCode = process.exitCode;
      const before = process.listeners("uncaughtException").length;
      const dispose = installProcessErrorHandlers(tracker);
      const listeners = process.listeners("uncaughtException");
      expect(listeners).toHaveLength(before + 1);

      try {
        listeners[listeners.length - 1](new Error("thrown from a timer"), "uncaughtException");

        expect(write.mock.calls[0][2]).toMatchObject({ source: "process.uncaughtException", fatal: true });
        expect(process.exitCode).toBe(1);
      } finally {
        process.exitCode = savedExitCode;
        dispose();
      }

      expect(process.listeners("uncaughtException")).toHaveLength(before);
    });
  });
});
