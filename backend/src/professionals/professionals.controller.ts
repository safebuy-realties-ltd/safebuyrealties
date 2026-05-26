import { Body, Controller, Get, Param, Patch, Put, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";
import { VerifyCredentialDto } from "./dto/verify-credential.dto";
import { ProfessionalsService } from "./professionals.service";

@Controller("professionals")
@UseGuards(JwtAuthGuard)
export class ProfessionalsController {
  constructor(private professionals: ProfessionalsService) {}

  @Get("me/profile")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PROFESSIONAL)
  getMyProfile(@CurrentUser() user: JwtPayload) {
    return this.professionals.getMyProfile(user.sub);
  }

  @Put("me/profile")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PROFESSIONAL)
  updateMyProfile(@Body() dto: UpdateMyProfileDto, @CurrentUser() user: JwtPayload) {
    return this.professionals.upsertMyProfile(user.sub, dto);
  }

  @Get("credentials/pending")
  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  listPending() {
    return this.professionals.listPending();
  }

  @Patch(":id/verify")
  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  verify(
    @Param("id") id: string,
    @Body() dto: VerifyCredentialDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.professionals.verify(id, dto, user.sub);
  }
}
