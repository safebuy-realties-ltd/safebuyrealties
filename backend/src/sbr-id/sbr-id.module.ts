import { Global, Module } from "@nestjs/common";
import { SbrIdService } from "./sbr-id.service";

@Global()
@Module({
  providers: [SbrIdService],
  exports: [SbrIdService],
})
export class SbrIdModule {}
