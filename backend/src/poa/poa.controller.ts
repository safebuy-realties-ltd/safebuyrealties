import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { ExecutePoaDto } from "./dto/execute-poa.dto";
import { PoaService } from "./poa.service";

@Controller("poa")
export class PoaController {
  constructor(private poa: PoaService) {}

  /** POST /poa/execute — buyer only */
  @Post("execute")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BUYER)
  execute(@Body() dto: ExecutePoaDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.poa.execute(dto, user, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }

  /** GET /poa/verify?hash= — public */
  @Get("verify")
  verify(@Query("hash") hash: string) {
    return this.poa.verifyByHash(hash ?? "");
  }
}
