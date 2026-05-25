import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { UserRole } from "@prisma/client";
import { CreateTaskDto } from "./dto/create-task.dto";
import { PatchTaskDto } from "./dto/patch-task.dto";
import { ListTasksMeQueryDto } from "./dto/list-tasks.query";

@Controller("tasks")
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: JwtPayload) {
    return this.tasks.create(dto, user);
  }

  @Get("me")
  listMine(@Query() query: ListTasksMeQueryDto, @CurrentUser() user: JwtPayload) {
    return this.tasks.listMine(query, user);
  }

  @Get("me/:id")
  getMineById(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.tasks.getMineById(id, user);
  }

  @Patch(":id")
  patch(@Param("id") id: string, @Body() dto: PatchTaskDto, @CurrentUser() user: JwtPayload) {
    return this.tasks.patch(id, dto, user);
  }
}
