import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { CreateStandaloneDdOrderDto } from "./dto/create-standalone-dd-order.dto";
import { InitiateStandaloneDdPaymentDto } from "./dto/initiate-standalone-dd-payment.dto";
import { ListStandaloneDdOrdersQueryDto } from "./dto/list-standalone-dd-orders.query";
import { UpdateStandaloneDdOrderDto } from "./dto/update-standalone-dd-order.dto";
import { AssignStandaloneDdDto } from "./dto/assign-standalone-dd.dto";
import { StandaloneDdService } from "./standalone-dd.service";

@Controller("standalone-dd")
export class StandaloneDdController {
  constructor(private readonly standaloneDd: StandaloneDdService) {}

  @Post("orders")
  @UseGuards(OptionalJwtAuthGuard)
  createOrder(
    @Body() dto: CreateStandaloneDdOrderDto,
    @Req() req: Request & { user?: JwtPayload | null },
  ) {
    return this.standaloneDd.createOrder(dto, req.user ?? null);
  }

  @Post("orders/:serviceId/pay")
  initiatePayment(
    @Param("serviceId") serviceId: string,
    @Body() dto: InitiateStandaloneDdPaymentDto,
  ) {
    return this.standaloneDd.initiatePayment(serviceId, dto);
  }

  @Post("orders/:serviceId/verify")
  verifyPayment(
    @Param("serviceId") serviceId: string,
    @Body() body: { reference?: string },
  ) {
    return this.standaloneDd.verifyPayment(serviceId, body?.reference);
  }

  @Get("orders/:serviceId")
  getOrder(@Param("serviceId") serviceId: string) {
    return this.standaloneDd.getOrder(serviceId);
  }

  @Get("orders")
  @UseGuards(JwtAuthGuard)
  listOrders(@CurrentUser() user: JwtPayload, @Query() query: ListStandaloneDdOrdersQueryDto) {
    return this.standaloneDd.listOrders(user, query);
  }

  @Get("professionals")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  listProfessionals(
    @CurrentUser() user: JwtPayload,
    @Query("scheduleCode") scheduleCode?: string,
  ) {
    return this.standaloneDd.listAssignableProfessionals(user, scheduleCode);
  }

  @Get("assignments/mine")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROFESSIONAL)
  listMyAssignments(@CurrentUser() user: JwtPayload) {
    return this.standaloneDd.listMyAssignments(user);
  }

  @Post("orders/:id/assignments")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  assignProfessional(
    @Param("id") id: string,
    @Body() dto: AssignStandaloneDdDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.standaloneDd.assignProfessional(id, dto, user);
  }

  @Post("assignments/:id/report")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROFESSIONAL, UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadAssignmentReport(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.standaloneDd.uploadAssignmentReport(id, file, user);
  }

  @Patch("orders/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updateOrder(
    @Param("id") id: string,
    @Body() dto: UpdateStandaloneDdOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.standaloneDd.updateOrder(id, dto, user);
  }

  @Post("orders/:id/report")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadReport(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.standaloneDd.uploadReport(id, file, user);
  }
}
