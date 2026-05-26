import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { VerificationService } from "./verification.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { AssignVerificationDto } from "./dto/assign-verification.dto";
import { PatchVerificationStepDto } from "./dto/patch-verification-step.dto";
import { RequestRevisionDto } from "./dto/request-revision.dto";

@Controller("verification")
@UseGuards(JwtAuthGuard)
export class VerificationController {
  constructor(private verification: VerificationService) {}

  @Post("assign")
  assign(@Body() dto: AssignVerificationDto, @CurrentUser() user: JwtPayload) {
    return this.verification.assign(dto, user);
  }

  @Get("listing/:listingId")
  getForListing(@Param("listingId") listingId: string, @CurrentUser() user: JwtPayload) {
    return this.verification.getForListing(listingId, user);
  }

  @Get("listing/:listingId/activity")
  getActivityForListing(@Param("listingId") listingId: string, @CurrentUser() user: JwtPayload) {
    return this.verification.getActivityForListing(listingId, user);
  }

  @Patch("steps/:stepId")
  patchStep(
    @Param("stepId") stepId: string,
    @Body() dto: PatchVerificationStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.verification.patchStep(stepId, dto, user);
  }

  @Patch("steps/:stepId/accept")
  acceptStep(@Param("stepId") stepId: string, @CurrentUser() user: JwtPayload) {
    return this.verification.acceptStep(stepId, user);
  }

  @Patch("steps/:stepId/request-revision")
  requestRevision(
    @Param("stepId") stepId: string,
    @Body() dto: RequestRevisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.verification.requestRevision(stepId, dto.note, user);
  }
}
