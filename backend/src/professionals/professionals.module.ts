import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { PlatformConfigModule } from "../platform-config/platform-config.module";
import { ProfessionalsController } from "./professionals.controller";
import { ProfessionalsService } from "./professionals.service";

@Module({
  imports: [StorageModule, PlatformConfigModule],
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
