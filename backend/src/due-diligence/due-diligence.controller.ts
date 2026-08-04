import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { DueDiligenceService } from "./due-diligence.service";
import { DueDiligenceCaseService } from "./due-diligence-case.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { AnonymousNotFoundFilter } from "../common/filters/anonymous-not-found.filter";
import { Roles } from "../common/decorators/roles.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { RequiresFeature } from "../common/decorators/feature.decorator";
import { PERMISSIONS } from "../common/permissions";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { CreateDdOrderDto } from "./dto/create-dd-order.dto";
import { ListDdOrdersQueryDto } from "./dto/list-dd-orders.query";
import { AssignDdProfessionalDto } from "./dto/assign-dd-professional.dto";
import { UpdateDdOrderDto } from "./dto/update-dd-order.dto";

const OPERATOR_ROLES = [UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN] as const;

@Controller("due-diligence-orders")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DueDiligenceController {
  constructor(
    private readonly dueDiligence: DueDiligenceService,
    private readonly cases: DueDiligenceCaseService,
  ) {}

  /** POST /due-diligence-orders — JWT required, BUYER only */
  @Post()
  @Roles(UserRole.BUYER)
  create(@Body() dto: CreateDdOrderDto, @CurrentUser() user: JwtPayload) {
    return this.dueDiligence.create(dto, user);
  }

  /**
   * GET /due-diligence-orders — the buyer's own cases, or every listing case for an operator.
   *
   * Both audiences read the same route rather than a `/me` and an `/admin` pair, because the case
   * they are looking at is the same case and a second route would be a second serializer to keep in
   * step. The scope lives in the service, where it is one `where` clause either way.
   *
   * `PermissionsGuard` sits on it because the route admits operators, and every route that admits an
   * operator must say what it costs one. The buyer is unaffected: privileges are an operator
   * concept, so a caller `@Roles` admitted who holds no internal role passes through the guard
   * untouched. See the class comment on `PermissionsGuard`.
   */
  @Get()
  @RequiresFeature("dd_case_lifecycle")
  @UseGuards(PermissionsGuard)
  @Roles(UserRole.BUYER, ...OPERATOR_ROLES)
  @RequirePermissions(PERMISSIONS.DD_ORDERS_READ)
  list(@Query() query: ListDdOrdersQueryDto, @CurrentUser() user: JwtPayload) {
    return this.cases.list(query, user);
  }

  @Get(":id")
  @RequiresFeature("dd_case_lifecycle")
  @UseGuards(PermissionsGuard)
  @Roles(UserRole.BUYER, ...OPERATOR_ROLES)
  @RequirePermissions(PERMISSIONS.DD_ORDERS_READ)
  getOne(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.cases.getOne(id, user);
  }

  /**
   * GET /due-diligence-orders/:id/reports — the links to the documents this buyer paid for (E1-S3).
   *
   * Separate from `getOne` because it does something `getOne` does not: every call mints new
   * credentials and writes an audit row per link. Folding it into the case response would mean
   * signing fresh links and recording an issue every time any screen read a case for any reason,
   * which would make the audit trail useless for the question it exists to answer.
   *
   * The guard stack is the one every operator-reachable route here carries. `AnonymousNotFoundFilter`
   * is the only addition, and it exists because criterion 3 asks for one answer to two questions:
   * a caller with no session and a caller who is the wrong buyer both hear that there is nothing
   * here. Without it the first would hear 401 and the second 404, and the difference between those
   * two answers is a working directory of which order ids are real.
   */
  @Get(":id/reports")
  @RequiresFeature("dd_case_lifecycle")
  @UseGuards(PermissionsGuard)
  @UseFilters(AnonymousNotFoundFilter)
  @Roles(UserRole.BUYER, ...OPERATOR_ROLES)
  @RequirePermissions(PERMISSIONS.DD_ORDERS_READ)
  listReports(@Param("id") id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.cases.listReports(id, user, req.ip ?? null);
  }

  @Post(":id/assignments")
  @RequiresFeature("dd_case_lifecycle")
  @UseGuards(PermissionsGuard)
  @Roles(...OPERATOR_ROLES)
  @RequirePermissions(PERMISSIONS.DD_ORDERS_WRITE)
  assign(
    @Param("id") id: string,
    @Body() dto: AssignDdProfessionalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cases.assign(id, dto, user);
  }

  @Patch(":id")
  @RequiresFeature("dd_case_lifecycle")
  @UseGuards(PermissionsGuard)
  @Roles(...OPERATOR_ROLES)
  @RequirePermissions(PERMISSIONS.DD_ORDERS_WRITE)
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateDdOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cases.updateStatus(id, dto, user);
  }
}
