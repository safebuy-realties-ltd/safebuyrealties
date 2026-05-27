import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { EscrowService } from "./escrow.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { EscrowActionDto } from "./dto/escrow-action.dto";
@Controller("escrow") @UseGuards(JwtAuthGuard, RolesGuard)
export class EscrowController {
  constructor(private readonly escrow: EscrowService) {}
  @Get("held") @Roles(UserRole.STAFF, UserRole.ADMIN) listHeld(@CurrentUser() u: JwtPayload) { return this.escrow.listHeld(u); }
  @Get(":transactionId") findOne(@Param("transactionId") id: string, @CurrentUser() u: JwtPayload) { return this.escrow.findByTransactionId(id, u); }
  @Post(":transactionId/release") @Roles(UserRole.STAFF, UserRole.ADMIN) release(@Param("transactionId") id: string, @Body() dto: EscrowActionDto, @CurrentUser() u: JwtPayload) { return this.escrow.release(id, u.sub, dto.note); }
  @Post(":transactionId/refund") @Roles(UserRole.STAFF, UserRole.ADMIN) refund(@Param("transactionId") id: string, @Body() dto: EscrowActionDto, @CurrentUser() u: JwtPayload) { return this.escrow.refund(id, u.sub, dto.note); }
}
