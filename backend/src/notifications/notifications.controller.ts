import { Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ListNotificationsQueryDto } from "./dto/list-notifications.query";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get("me")
  listMine(@Query() query: ListNotificationsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.notifications.listForUser(user.sub, query.page, query.pageSize);
  }

  @Patch("read-all")
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.notifications.markRead(user.sub, id);
  }
}
