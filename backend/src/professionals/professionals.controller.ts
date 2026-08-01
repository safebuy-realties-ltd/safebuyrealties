import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
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
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { PERMISSIONS } from "../common/permissions";
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

  @Post("me/documents")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PROFESSIONAL)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Query("kind") queryKind: string | undefined,
    @Body("kind") bodyKind: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.professionals.uploadDocument(user.sub, queryKind ?? bodyKind, file);
  }

  @Get("credentials/pending")
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.STAFF_OPS)
  listPending() {
    return this.professionals.listPending();
  }

  @Patch(":id/verify")
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.STAFF_OPS)
  verify(
    @Param("id") id: string,
    @Body() dto: VerifyCredentialDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.professionals.verify(id, dto, user.sub);
  }
}
