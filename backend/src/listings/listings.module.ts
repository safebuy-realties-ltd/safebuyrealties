import { Module } from "@nestjs/common";
import { SbrIdModule } from "../sbr-id/sbr-id.module";
import { ListingsService } from "./listings.service";
import { ListingsController } from "./listings.controller";

@Module({
  imports: [SbrIdModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
