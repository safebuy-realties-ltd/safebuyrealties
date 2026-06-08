import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { JwtPayload } from "../../auth/jwt.strategy";
import { roleSatisfies } from "../user-roles";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Authentication required");
    if (!roleSatisfies(user.role, required)) {
      throw new ForbiddenException("Insufficient permissions");
    }
    return true;
  }
}
