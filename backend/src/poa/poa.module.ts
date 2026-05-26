import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { PoaController } from "./poa.controller";
import { PoaService } from "./poa.service";

@Module({
  imports: [StorageModule],
  controllers: [PoaController],
  providers: [PoaService],
  exports: [PoaService],
})
export class PoaModule {}
