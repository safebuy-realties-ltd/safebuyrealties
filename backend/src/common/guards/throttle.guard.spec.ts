import { Controller, ExecutionContext, Get, HttpStatus, Logger, Post } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SkipThrottle, Throttle } from "../decorators/throttle.decorator";
import { TooManyRequestsException } from "../throttle/too-many-requests.exception";
import { THROTTLE_DISABLED_ENV_VAR } from "../throttle/throttle.constants";
import { ThrottleGuard } from "./throttle.guard";
import type { ClassRef, HandlerRef } from "./route-inventory";

/**
 * The four shapes a real controller takes: nothing declared, a policy on the handler, a policy on
 * the class, and an exemption on the class. The shipped decorators are used, so `Reflector` reads
 * this metadata exactly as it reads a shipped controller's.
 */
@Controller("test-throttle")
class PlainController {
  @Get("open")
  open() {
    return null;
  }

  @Post("login")
  @Throttle("login")
  login() {
    return null;
  }
}

@Controller("test-throttle-webhooks")
@Throttle("webhook")
class WebhookController {
  @Post(":provider")
  handle() {
    return null;
  }
}

@Controller("test-throttle-health")
@SkipThrottle()
class HealthLikeController {
  @Get("live")
  live() {
    return null;
  }
}

function contextFor(controller: ClassRef, handlerName: string, ip: string): ExecutionContext {
  const req = { ip, method: "POST", url: "/api/v1/auth/login" };
  return {
    getClass: () => controller,
    getHandler: () => (controller.prototype as Record<string, HandlerRef>)[handlerName],
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

/** Calls the guard until it refuses, and returns how many calls got through. */
function admittedBefore429(guard: ThrottleGuard, context: ExecutionContext, ceiling = 500): number {
  for (let i = 0; i < ceiling; i += 1) {
    try {
      guard.canActivate(context);
    } catch {
      return i;
    }
  }
  return ceiling;
}

describe("ThrottleGuard", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // The guard resolves its policies once, at construction, so the environment has to be in place
    // before each `new ThrottleGuard(...)` below.
    process.env = { ...originalEnv };
    delete process.env[THROTTLE_DISABLED_ENV_VAR];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function build(env: Record<string, string> = {}): ThrottleGuard {
    Object.assign(process.env, env);
    return new ThrottleGuard(new Reflector());
  }

  describe("the limit", () => {
    it("admits exactly the configured number and refuses the next (criterion 6)", () => {
      const guard = build({ THROTTLE_LOGIN: "3:60" });
      const context = contextFor(PlainController, "login", "1.2.3.4");

      expect(admittedBefore429(guard, context)).toBe(3);
    });

    it("refuses with 429 and carries the seconds to wait", () => {
      const guard = build({ THROTTLE_LOGIN: "1:60" });
      const context = contextFor(PlainController, "login", "1.2.3.4");
      guard.canActivate(context);

      let thrown: TooManyRequestsException | undefined;
      try {
        guard.canActivate(context);
      } catch (err) {
        thrown = err as TooManyRequestsException;
      }

      expect(thrown).toBeInstanceOf(TooManyRequestsException);
      expect(thrown?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = thrown?.getResponse() as { details: { retryAfterSeconds: number } };
      // The filter turns this into the Retry-After header. See http-exception.filter.spec.ts.
      expect(body.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(body.details.retryAfterSeconds).toBeLessThanOrEqual(60);
    });

    it("counts each caller separately, so one address cannot lock out the rest", () => {
      const guard = build({ THROTTLE_LOGIN: "1:60" });
      guard.canActivate(contextFor(PlainController, "login", "1.2.3.4"));

      expect(() => guard.canActivate(contextFor(PlainController, "login", "1.2.3.4"))).toThrow(
        TooManyRequestsException,
      );
      expect(guard.canActivate(contextFor(PlainController, "login", "5.6.7.8"))).toBe(true);
    });

    it("says nothing back about the caller or the count", () => {
      const guard = build({ THROTTLE_LOGIN: "1:60" });
      const context = contextFor(PlainController, "login", "1.2.3.4");
      guard.canActivate(context);

      try {
        guard.canActivate(context);
        throw new Error("expected a refusal");
      } catch (err) {
        const message = (err as Error).message;
        expect(message).not.toContain("1.2.3.4");
        expect(message).not.toContain("login");
        expect(message).toMatch(/Too many requests/);
      }
    });

    it("gives a route with no decorator the global default", () => {
      const guard = build({ THROTTLE_GLOBAL: "2:60" });
      const context = contextFor(PlainController, "open", "1.2.3.4");

      expect(admittedBefore429(guard, context)).toBe(2);
    });

    it("keeps one policy's allowance out of another's", () => {
      const guard = build({ THROTTLE_LOGIN: "1:60", THROTTLE_GLOBAL: "50:60" });
      guard.canActivate(contextFor(PlainController, "login", "1.2.3.4"));

      expect(() => guard.canActivate(contextFor(PlainController, "login", "1.2.3.4"))).toThrow(
        TooManyRequestsException,
      );
      expect(guard.canActivate(contextFor(PlainController, "open", "1.2.3.4"))).toBe(true);
    });
  });

  describe("the exemptions", () => {
    it("holds webhooks to their own policy, not the login one (criterion 4)", () => {
      const guard = build({ THROTTLE_LOGIN: "1:60", THROTTLE_WEBHOOK: "5:60" });
      const context = contextFor(WebhookController, "handle", "1.2.3.4");

      // A gateway retrying five times in a minute is normal traffic. On the login policy the
      // second of those would have been refused, and a refused webhook strands a real payment.
      expect(admittedBefore429(guard, context)).toBe(5);
    });

    it("never throttles a route that opted out, however many times it is called", () => {
      const guard = build({ THROTTLE_GLOBAL: "1:60" });
      const context = contextFor(HealthLikeController, "live", "1.2.3.4");

      // A 429 on a liveness probe reads as a failed probe, and enough failed probes is a restart.
      for (let i = 0; i < 50; i += 1) {
        expect(guard.canActivate(context)).toBe(true);
      }
    });
  });

  describe("the kill switch", () => {
    it("passes everything while it is set", () => {
      const guard = build({ [THROTTLE_DISABLED_ENV_VAR]: "true", THROTTLE_LOGIN: "1:60" });
      const context = contextFor(PlainController, "login", "1.2.3.4");

      for (let i = 0; i < 20; i += 1) {
        expect(guard.canActivate(context)).toBe(true);
      }
    });

    it("says so at boot, every time", () => {
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      build({ [THROTTLE_DISABLED_ENV_VAR]: "true" }).onModuleInit();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining(THROTTLE_DISABLED_ENV_VAR));
      warn.mockRestore();
    });

    it("warns about a value it had to ignore rather than silently using the default", () => {
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      build({ THROTTLE_LOGIN: "lots" }).onModuleInit();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("THROTTLE_LOGIN"));
      warn.mockRestore();
    });
  });
});
