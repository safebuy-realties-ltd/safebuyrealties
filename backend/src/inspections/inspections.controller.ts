import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { InspectionsService } from "./inspections.service";
import { CreateInspectionRequestDto } from "./dto/create-inspection-request.dto";
import { PatchInspectionSlotDto } from "./dto/patch-inspection-slot.dto";

@Controller()
@UseGuards(JwtAuthGuard)
export class InspectionsController {
  constructor(private inspections: InspectionsService) {}

  @Post("listings/:listingId/inspection-requests")
  @UseGuards(RolesGuard)
  @Roles(UserRole.BUYER)
  create(
    @Param("listingId") listingId: string,
    @Body() dto: CreateInspectionRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inspections.createForListing(listingId, dto, user);
  }

  @Get("listings/:listingId/inspection-requests")
  listForListing(@Param("listingId") listingId: string, @CurrentUser() user: JwtPayload) {
    return this.inspections.listForListing(listingId, user);
  }

  @Get("inspections/queue")
  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  listQueue(@CurrentUser() user: JwtPayload) {
    return this.inspections.listQueue(user);
  }

  @Get("inspections/me")
  @UseGuards(RolesGuard)
  @Roles(UserRole.BUYER)
  listMine(@CurrentUser() user: JwtPayload) {
    return this.inspections.listForBuyerTransactions(user.sub);
  }

  @Patch("inspection-slots/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  patch(@Param("id") id: string, @Body() dto: PatchInspectionSlotDto, @CurrentUser() user: JwtPayload) {
    return this.inspections.patch(id, dto, user);
  }
}
