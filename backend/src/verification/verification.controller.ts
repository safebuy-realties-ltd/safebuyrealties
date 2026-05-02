import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { VerificationService } from "./verification.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { AssignVerificationDto } from "./dto/assign-verification.dto";
import { PatchVerificationStepDto } from "./dto/patch-verification-step.dto";

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

  @Patch("steps/:stepId")
  patchStep(
    @Param("stepId") stepId: string,
    @Body() dto: PatchVerificationStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.verification.patchStep(stepId, dto, user);
  }
}
