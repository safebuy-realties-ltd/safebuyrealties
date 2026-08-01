import { Controller, Get, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { PERMISSIONS } from "../common/permissions";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get("analytics")
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  getAnalytics(@CurrentUser() user: JwtPayload) {
    return this.admin.getAnalytics(user);
  }
}
