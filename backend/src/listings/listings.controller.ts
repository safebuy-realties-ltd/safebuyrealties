import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ListingsService } from "./listings.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CurrentUserOptional } from "../common/decorators/current-user-optional.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { CreateListingDto } from "./dto/create-listing.dto";
import { UpdateListingDto } from "./dto/update-listing.dto";
import { ListListingsQueryDto } from "./dto/list-listings.query";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";

@Controller("listings")
export class ListingsController {
  constructor(private listings: ListingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateListingDto, @CurrentUser() user: JwtPayload) {
    return this.listings.create(dto, user);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@Query() query: ListListingsQueryDto, @CurrentUserOptional() user: JwtPayload | null) {
    return this.listings.findAll(query, user);
  }

  @Get("saved")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BUYER)
  findSaved(
    @CurrentUser() user: JwtPayload,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.listings.findSaved(user, page ? Number(page) : 1, pageSize ? Number(pageSize) : 20);
  }

  @Get(":id/analytics")
  @UseGuards(JwtAuthGuard)
  getAnalytics(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.listings.getListingAnalytics(id, user);
  }

  @Post(":id/save")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BUYER)
  save(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.listings.saveListing(id, user);
  }

  @Delete(":id/save")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BUYER)
  unsave(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.listings.unsaveListing(id, user);
  }

  @Get(":id")
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param("id") id: string, @CurrentUserOptional() user: JwtPayload | null) {
    return this.listings.findOne(id, user);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  update(@Param("id") id: string, @Body() dto: UpdateListingDto, @CurrentUser() user: JwtPayload) {
    return this.listings.update(id, dto, user);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  remove(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.listings.remove(id, user);
  }
}
