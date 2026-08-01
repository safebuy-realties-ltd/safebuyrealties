import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Put,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { PERMISSIONS } from "../common/permissions";
import { isInternalRole } from "../common/user-roles";
import { isFeatureFlagKey, type FeatureFlagKey } from "./feature-flags.constants";
import { SetFeatureFlagDto, SetKillSwitchDto } from "./dto/set-feature-flag.dto";
import { FeatureFlagsService } from "./feature-flags.service";

@Controller("feature-flags")
export class FeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  /**
   * Readable without a session, and what comes back depends on who asked. An operator gets the
   * whole snapshot, sources and kill switch included. Everyone else, signed in or not, gets the
   * client-visible keys and their values.
   *
   * Open to a guest because the public pages are flagged too, and a flag the browser can only read
   * after signing in is a flag that does not work on the pages that need it most. What a guest sees
   * is the set marked `client`, which is the same set a bundle would have to carry anyway. The
   * server-only flags, which include the operational kill switch on a live route, stay out of it.
   *
   * No `@Roles`, the same shape as `PlatformConfigController.get`, so `route-inventory` does not
   * count it as an operator route and no privilege is required to reach it.
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  get(@CurrentUser() user?: JwtPayload | null) {
    if (user && isInternalRole(user.role)) return this.featureFlags.snapshot();
    return { flags: this.featureFlags.clientFlags() };
  }

  /**
   * Declared before the `:key` routes so that "kill-switch" is never read as a flag name. It would
   * fail the registry check below anyway, but relying on that would make the ordering load-bearing
   * and invisible.
   */
  @Put("kill-switch")
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.PLATFORM_CONFIG)
  setKillSwitch(@Body() dto: SetKillSwitchDto, @CurrentUser() user: JwtPayload) {
    return this.featureFlags.setKillSwitch(dto.armed, user.sub);
  }

  @Patch(":key")
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.PLATFORM_CONFIG)
  setOverride(
    @Param("key") key: string,
    @Body() dto: SetFeatureFlagDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.featureFlags.setOverride(this.knownFlag(key), dto.enabled, user.sub);
  }

  @Delete(":key")
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.PLATFORM_CONFIG)
  clearOverride(@Param("key") key: string, @CurrentUser() user: JwtPayload) {
    return this.featureFlags.clearOverride(this.knownFlag(key), user.sub);
  }

  /**
   * The path parameter arrives as a string, so this is the boundary where it becomes a key or
   * becomes a 404. Nothing downstream accepts an unchecked string, which is what keeps the registry
   * closed at runtime as well as at compile time.
   */
  private knownFlag(key: string): FeatureFlagKey {
    if (!isFeatureFlagKey(key)) {
      throw new NotFoundException(`No feature flag named "${key}"`);
    }
    return key;
  }
}
