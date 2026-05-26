import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PlatformConfigService } from "../../platform-config/platform-config.service";
import { JwtPayload } from "../../auth/jwt.strategy";

/** Paths that remain available while maintenanceMode is enabled. */
const MAINTENANCE_EXEMPT_PREFIXES = ["/api/v1/health", "/api/v1/auth"];

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(private readonly platformConfig: PlatformConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ url?: string; user?: JwtPayload }>();
    const url = req.url ?? "";

    if (MAINTENANCE_EXEMPT_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      return true;
    }

    const config = await this.platformConfig.get();
    if (!config.maintenanceMode) return true;

    const user = req.user;
    if (user?.role === UserRole.ADMIN) return true;

    throw new ServiceUnavailableException("Platform is under maintenance");
  }
}
