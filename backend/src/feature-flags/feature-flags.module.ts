import { Global, Module } from "@nestjs/common";
import { FeatureFlagsController } from "./feature-flags.controller";
import { FeatureFlagsService } from "./feature-flags.service";

/**
 * `@Global` for the same reason `AuditModule` and `PermissionsModule` are: `FeatureGuard` is
 * mounted as an `APP_GUARD` and therefore built in the root injector, and any service that wants to
 * ask `isEnabled` should not have to add an import to its own module first. An import people forget
 * is a flag that reads off in production and on in the test that mocked it.
 */
@Global()
@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
