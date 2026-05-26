import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UpdatePlatformConfigDto } from "./dto/update-platform-config.dto";
import { PlatformConfigService } from "./platform-config.service";

@Controller("platform-config")
@UseGuards(JwtAuthGuard)
export class PlatformConfigController {
  constructor(private platformConfig: PlatformConfigService) {}

  @Get()
  get() {
    return this.platformConfig.get();
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Body() dto: UpdatePlatformConfigDto, @CurrentUser() user: JwtPayload) {
    return this.platformConfig.update(dto, user.sub);
  }
}
