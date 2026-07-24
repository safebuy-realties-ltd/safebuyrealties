import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ArrayMinSize,
} from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/jwt.strategy";
import { PERMISSIONS } from "../common/permissions";
import { DdCmsService } from "./dd-cms.service";

class CreateScheduleDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(1)
  letter!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  shortName!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestedProfessionalTypes?: string[];

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  letter?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  shortName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestedProfessionalTypes?: string[];

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class CreateItemDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class ReorderDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedIds!: string[];
}

@Controller()
export class DdCmsController {
  constructor(private ddCms: DdCmsService) {}

  /** Public (and authenticated) catalog of active schedules + checklist items. */
  @Get("dd-checklists")
  listPublic() {
    return this.ddCms.listPublic();
  }

  @Get("admin/dd-checklists")
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STAFF)
  @RequirePermissions(PERMISSIONS.DD_CHECKLISTS_MANAGE)
  listAdmin() {
    return this.ddCms.listAdmin();
  }

  @Post("admin/dd-checklists/schedules")
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.DD_CHECKLISTS_MANAGE)
  createSchedule(@CurrentUser() user: JwtPayload, @Body() dto: CreateScheduleDto) {
    return this.ddCms.createSchedule(dto, user.sub);
  }

  @Patch("admin/dd-checklists/schedules/:id")
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.DD_CHECKLISTS_MANAGE)
  updateSchedule(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.ddCms.updateSchedule(id, dto, user.sub);
  }

  @Post("admin/dd-checklists/schedules/:id/items")
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.DD_CHECKLISTS_MANAGE)
  createItem(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: CreateItemDto,
  ) {
    return this.ddCms.createItem(id, dto, user.sub);
  }

  @Patch("admin/dd-checklists/items/:itemId")
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.DD_CHECKLISTS_MANAGE)
  updateItem(
    @CurrentUser() user: JwtPayload,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.ddCms.updateItem(itemId, dto, user.sub);
  }

  @Post("admin/dd-checklists/schedules/:id/reorder")
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.DD_CHECKLISTS_MANAGE)
  reorder(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.ddCms.reorderItems(id, dto.orderedIds, user.sub);
  }
}
