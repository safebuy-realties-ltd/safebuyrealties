import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { IsArray, IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/jwt.strategy";
import { PERMISSIONS } from "../common/permissions";
import { PermissionsService } from "./permissions.service";

class SetPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

@Controller("admin/permissions")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private permissions: PermissionsService) {}

  @Get("catalog")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.PERMISSIONS_MANAGE)
  catalog() {
    return this.permissions.listCatalog();
  }

  @Get("users/:userId")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.PERMISSIONS_MANAGE)
  getUser(@CurrentUser() user: JwtPayload, @Param("userId") userId: string) {
    return this.permissions.getUserPermissions(user.sub, user.role, userId);
  }

  @Put("users/:userId")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.PERMISSIONS_MANAGE)
  setUser(
    @CurrentUser() user: JwtPayload,
    @Param("userId") userId: string,
    @Body() dto: SetPermissionsDto,
  ) {
    return this.permissions.setUserPermissions(user.sub, user.role, userId, dto.permissions);
  }
}
