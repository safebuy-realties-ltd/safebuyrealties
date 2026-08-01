import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { PERMISSIONS } from "../common/permissions";
import { UpdatePlatformConfigDto } from "./dto/update-platform-config.dto";
import { PlatformConfigService } from "./platform-config.service";

@Controller("platform-config")
@UseGuards(JwtAuthGuard)
export class PlatformConfigController {
  constructor(private platformConfig: PlatformConfigService) {}

  // No `@Roles`: every signed-in account reads the config, and `getForRole` decides which fields
  // it gets back. Not an operator route, so it declares no privilege.
  @Get()
  async get(@CurrentUser() user: JwtPayload) {
    const config = await this.platformConfig.get();
    return this.platformConfig.getForRole(user.role, config);
  }

  @Patch()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @RequirePermissions(PERMISSIONS.PLATFORM_CONFIG)
  update(@Body() dto: UpdatePlatformConfigDto, @CurrentUser() user: JwtPayload) {
    return this.platformConfig.update(dto, user.sub);
  }
}
