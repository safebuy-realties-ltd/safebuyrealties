import { Controller, ExecutionContext, Get, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FeatureFlagsService } from "../../feature-flags/feature-flags.service";
import { RequiresFeature } from "../decorators/feature.decorator";
import { FeatureGuard } from "./feature.guard";
import type { ClassRef, HandlerRef } from "./route-inventory";

/**
 * Three shapes a real controller can take: nothing declared, a flag on the handler, and a flag on
 * the class that a handler disagrees with. The real decorator is used, so `Reflector` reads the
 * metadata exactly as it reads a shipped controller's.
 */
@Controller("test-fixtures")
class PlainController {
  @Get("open")
  open() {
    return null;
  }

  @Get("gated")
  @RequiresFeature("payouts")
  gated() {
    return null;
  }
}

@Controller("test-fixtures-gated")
@RequiresFeature("payouts")
class GatedController {
  @Get("inherits")
  inherits() {
    return null;
  }

  /** A route inside a gated controller that answers to a different flag. The handler should win. */
  @Get("overrides")
  @RequiresFeature("kyc_gate")
  overrides() {
    return null;
  }
}

describe("FeatureGuard", () => {
  let guard: FeatureGuard;
  let isEnabled: jest.Mock;
  let enabled: Set<string>;

  beforeEach(() => {
    enabled = new Set();
    isEnabled = jest.fn((key: string) => enabled.has(key));
    guard = new FeatureGuard(new Reflector(), { isEnabled } as unknown as FeatureFlagsService);
  });

  function contextFor(controller: ClassRef, handlerName: string): ExecutionContext {
    const req = { method: "GET", url: "/api/v1/standalone-dd/orders/svc-1" };
    return {
      getClass: () => controller,
      getHandler: () => (controller.prototype as Record<string, HandlerRef>)[handlerName],
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  it("passes a route that declares no flag, without asking the service anything", () => {
    expect(guard.canActivate(contextFor(PlainController, "open"))).toBe(true);
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it("passes a gated route while its flag is on", () => {
    enabled.add("payouts");
    expect(guard.canActivate(contextFor(PlainController, "gated"))).toBe(true);
    expect(isEnabled).toHaveBeenCalledWith("payouts");
  });

  it("answers 404 while the flag is off, not 403", () => {
    expect(() => guard.canActivate(contextFor(PlainController, "gated"))).toThrow(
      NotFoundException,
    );
  });

  it("uses the message Nest emits for a path it does not serve, so the route reads as absent", () => {
    expect(() => guard.canActivate(contextFor(PlainController, "gated"))).toThrow(
      "Cannot GET /api/v1/standalone-dd/orders/svc-1",
    );
  });

  it("gates every handler under a gated controller", () => {
    expect(() => guard.canActivate(contextFor(GatedController, "inherits"))).toThrow(
      NotFoundException,
    );
    enabled.add("payouts");
    expect(guard.canActivate(contextFor(GatedController, "inherits"))).toBe(true);
  });

  it("lets the handler's flag win over the controller's", () => {
    enabled.add("payouts");
    expect(() => guard.canActivate(contextFor(GatedController, "overrides"))).toThrow(
      NotFoundException,
    );
    expect(isEnabled).toHaveBeenCalledWith("kyc_gate");
    expect(isEnabled).not.toHaveBeenCalledWith("payouts");

    enabled.add("kyc_gate");
    expect(guard.canActivate(contextFor(GatedController, "overrides"))).toBe(true);
  });
});
