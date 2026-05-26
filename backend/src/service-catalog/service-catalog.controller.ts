import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ServiceCatalogService, UpdateItemDto } from "./service-catalog.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";

class CalculateDto {
  itemIds?: string[];
  bundleId?: string;
}

@Controller("service-catalog")
export class ServiceCatalogController {
  constructor(private readonly serviceCatalog: ServiceCatalogService) {}

  /** GET /service-catalog/items — public */
  @Get("items")
  getItems() {
    return this.serviceCatalog.getItems();
  }

  /** GET /service-catalog/bundles — public */
  @Get("bundles")
  getBundles() {
    return this.serviceCatalog.getBundles();
  }

  /** POST /service-catalog/calculate — JWT required */
  @UseGuards(JwtAuthGuard)
  @Post("calculate")
  calculate(@Body() body: CalculateDto) {
    return this.serviceCatalog.calculate(body.itemIds, body.bundleId);
  }

  /** PATCH /service-catalog/items/:id — ADMIN only */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch("items/:id")
  updateItem(@Param("id") id: string, @Body() body: UpdateItemDto) {
    return this.serviceCatalog.updateItem(id, body);
  }
}
