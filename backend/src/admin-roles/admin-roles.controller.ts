import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { IsArray, IsOptional, IsString, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import {
  RequireAnyPermission,
  RequirePermissions,
} from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/jwt.strategy";
import { PERMISSIONS, PERMISSION_LABELS, PERMISSION_NAV_UNLOCKS } from "../common/permissions";
import { AdminRolesService } from "./admin-roles.service";

class CreateAdminRoleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

class UpdateAdminRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

@Controller("admin/roles")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AdminRolesController {
  constructor(private roles: AdminRolesService) {}

  /** Privilege catalog with labels + which dashboard areas each unlocks. */
  @Get("privileges")
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  privileges() {
    return {
      data: Object.values(PERMISSIONS).map((code) => ({
        code,
        label: PERMISSION_LABELS[code],
        unlocks: PERMISSION_NAV_UNLOCKS[code],
      })),
    };
  }

  @Get()
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  // Readable by anyone who can manage users or roles (needed for assign dropdown). The user
  // screen sits behind users.read and populates its admin-role select from this list, so an
  // all-of roles.manage here would close that screen to every seeded role but Super Administrator.
  @RequireAnyPermission(PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_READ)
  list(@CurrentUser() user: JwtPayload) {
    return this.roles.listForActor(user.sub, user.role);
  }

  @Get(":id")
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  get(@Param("id") id: string) {
    return this.roles.get(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAdminRoleDto) {
    return this.roles.create(user.sub, user.role, dto);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateAdminRoleDto,
  ) {
    return this.roles.update(user.sub, user.role, id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.roles.remove(user.sub, user.role, id);
  }
}
