import { Module } from "@nestjs/common";
import { ServiceCatalogController } from "./service-catalog.controller";
import { ServiceCatalogService } from "./service-catalog.service";
import { PlatformConfigModule } from "../platform-config/platform-config.module";

@Module({
  imports: [PlatformConfigModule],
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogService],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
