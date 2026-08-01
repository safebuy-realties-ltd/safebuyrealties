import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "../common/permissions";
import { SubmitKycDto } from "./dto/submit-kyc.dto";
import { RejectKycDto } from "./dto/reject-kyc.dto";
import { KycService } from "./kyc.service";

@Controller("kyc")
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private kyc: KycService) {}

  @Get("me")
  getMy(@CurrentUser() user: JwtPayload) {
    return this.kyc.getMy(user.sub);
  }

  @Post("upload")
  @UseGuards(RolesGuard)
  @Roles(UserRole.BUYER)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPayload) {
    return this.kyc.uploadDocument(user.sub, file);
  }

  @Post("submit")
  @UseGuards(RolesGuard)
  @Roles(UserRole.BUYER)
  submit(@Body() dto: SubmitKycDto, @CurrentUser() user: JwtPayload) {
    return this.kyc.submit(user.sub, dto);
  }

  @Get("queue")
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @RequirePermissions(PERMISSIONS.STAFF_OPS)
  listQueue() {
    return this.kyc.listQueue();
  }

  @Patch(":userId/verify")
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @RequirePermissions(PERMISSIONS.STAFF_OPS)
  verify(@Param("userId") userId: string, @CurrentUser() user: JwtPayload) {
    return this.kyc.verify(userId, user.sub);
  }

  @Patch(":userId/reject")
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @RequirePermissions(PERMISSIONS.STAFF_OPS)
  reject(
    @Param("userId") userId: string,
    @Body() dto: RejectKycDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.kyc.reject(userId, user.sub, dto.note);
  }
}
