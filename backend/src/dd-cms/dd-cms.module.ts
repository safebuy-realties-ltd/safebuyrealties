import { Module } from "@nestjs/common";
import { DdCmsController } from "./dd-cms.controller";
import { DdCmsService } from "./dd-cms.service";

@Module({
  controllers: [DdCmsController],
  providers: [DdCmsService],
  exports: [DdCmsService],
})
export class DdCmsModule {}
