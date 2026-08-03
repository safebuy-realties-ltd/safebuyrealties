import { Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequiresFeature } from "../common/decorators/feature.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { DueDiligenceCaseService } from "./due-diligence-case.service";

/**
 * A second controller for a second prefix. Nest binds one path prefix per controller and the
 * assignment is addressed by its own id, not by the case it belongs to, because the professional
 * filing the report holds the assignment id and has no reason to know the case id.
 *
 * No `@Roles` here on purpose. Every caller who is not the assignee has to come back 404, and a role
 * check would answer some of them 403 instead, which is the difference between "you cannot have
 * this" and "this exists and you cannot have it". The service makes that call once, for everybody.
 */
@Controller("due-diligence-assignments")
@UseGuards(JwtAuthGuard)
export class DueDiligenceAssignmentsController {
  constructor(private readonly cases: DueDiligenceCaseService) {}

  @Post(":id/report")
  @RequiresFeature("dd_case_lifecycle")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  submitReport(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cases.submitAssignmentReport(id, file, user);
  }
}
