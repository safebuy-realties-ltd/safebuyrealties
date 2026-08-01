import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { EscrowService } from "./escrow.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { PERMISSIONS } from "../common/permissions";
import { EscrowActionDto } from "./dto/escrow-action.dto";

/**
 * Releasing and refunding escrow is the action E4-S1 was written around: three seeded admin
 * roles share `UserRole.ADMIN`, so the role check below admits a Content Manager, and only
 * `escrows.write` keeps them out. The route bodies were one line each before; they are split
 * here so the privilege each one costs is legible next to the role that reaches it.
 */
@Controller("escrow")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class EscrowController {
  constructor(private readonly escrow: EscrowService) {}

  @Get("held")
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @RequirePermissions(PERMISSIONS.ESCROWS_READ)
  listHeld(@CurrentUser() u: JwtPayload) {
    return this.escrow.listHeld(u);
  }

  // No `@Roles`: a buyer and a seller read their own escrow here, and `findByTransactionId`
  // scopes the row to the caller. Not an operator route, so it declares no privilege.
  @Get(":transactionId")
  findOne(@Param("transactionId") id: string, @CurrentUser() u: JwtPayload) {
    return this.escrow.findByTransactionId(id, u);
  }

  @Post(":transactionId/release")
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @RequirePermissions(PERMISSIONS.ESCROWS_WRITE)
  release(
    @Param("transactionId") id: string,
    @Body() dto: EscrowActionDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.escrow.release(id, u.sub, dto.note);
  }

  @Post(":transactionId/refund")
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @RequirePermissions(PERMISSIONS.ESCROWS_WRITE)
  refund(
    @Param("transactionId") id: string,
    @Body() dto: EscrowActionDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.escrow.refund(id, u.sub, dto.note);
  }
}
