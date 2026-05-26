import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { DueDiligenceService } from "./due-diligence.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { CreateDdOrderDto } from "./dto/create-dd-order.dto";

@Controller("due-diligence-orders")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DueDiligenceController {
  constructor(private readonly dueDiligence: DueDiligenceService) {}

  /** POST /due-diligence-orders — JWT required, BUYER only */
  @Post()
  @Roles(UserRole.BUYER)
  create(@Body() dto: CreateDdOrderDto, @CurrentUser() user: JwtPayload) {
    return this.dueDiligence.create(dto, user);
  }
}
