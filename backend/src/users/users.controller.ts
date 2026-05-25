import { Controller, Get, Patch, Param, Query, Body, UseGuards } from "@nestjs/common";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { UserRole } from "@prisma/client";
import { ListUsersQueryDto } from "./dto/list-users.query";
import { UpdateUserDto } from "./dto/update-user.dto";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.users.findOne(id, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: JwtPayload) {
    return this.users.update(id, dto, user);
  }
}
