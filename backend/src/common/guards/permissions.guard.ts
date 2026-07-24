import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { hasPermission, type Permission } from "../permissions";
import { PermissionsService } from "../../permissions/permissions.service";
import type { JwtPayload } from "../../auth/jwt.strategy";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Authentication required");

    const effective = await this.permissions.getEffectivePermissions(user.sub, user.role);
    if (!hasPermission(effective, required)) {
      throw new ForbiddenException("Insufficient permissions");
    }
    return true;
  }
}
