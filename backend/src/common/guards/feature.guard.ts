import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FEATURE_FLAG_KEY } from "../decorators/feature.decorator";
import { FeatureFlagsService } from "../../feature-flags/feature-flags.service";
import type { FeatureFlagKey } from "../../feature-flags/feature-flags.constants";

/**
 * Enforces `@RequiresFeature`, mounted globally so a story author writes one decorator and nothing
 * else. Registered in `app.module.ts` next to `MaintenanceGuard`.
 *
 * A route with no `@RequiresFeature` on it costs one `Reflector` lookup and passes, which is why
 * this can be global without every unflagged route paying for the flag system.
 *
 * **404 rather than 403.** A flag that is off means the feature is not there yet, so the honest
 * answer is the one an unbuilt route would give. 403 says "this exists and you may not have it",
 * which tells an anonymous caller what is coming and, on a kill switch, tells them the thing they
 * just lost access to is still running. Shipping dark means dark.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<FeatureFlagKey | undefined>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!flag) return true;
    if (this.featureFlags.isEnabled(flag)) return true;

    // Nest's own message for a path it does not serve, rebuilt from the request, so a flagged-off
    // route is indistinguishable from one that was never mounted.
    const req = context.switchToHttp().getRequest<{ method?: string; url?: string }>();
    throw new NotFoundException(`Cannot ${req.method ?? "GET"} ${req.url ?? ""}`.trimEnd());
  }
}
