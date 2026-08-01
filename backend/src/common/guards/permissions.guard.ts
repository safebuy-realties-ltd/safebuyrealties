import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import {
  PERMISSIONS_KEY,
  ANY_PERMISSIONS_KEY,
} from "../decorators/permissions.decorator";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { hasPermission, type Permission } from "../permissions";
import { isInternalRole } from "../user-roles";
import { PermissionsService } from "../../permissions/permissions.service";
import { AuditService } from "../../audit/audit.service";
import { AuditAction } from "../../audit/audit-actions.constants";
import type { JwtPayload } from "../../auth/jwt.strategy";

/** What a route declares about who may use it. */
interface RouteDeclaration {
  /** Every one of these is required. */
  all: Permission[];
  /** At least one of these is required. */
  any: Permission[];
  /** True when `@Roles` admits STAFF, ADMIN or SUPER_ADMIN. */
  reachableByOperators: boolean;
}

/**
 * Privilege enforcement for operator routes.
 *
 * `RolesGuard` answers "is this the kind of account that may reach this route". This answers
 * "does this operator hold the privilege the route needs" — the distinction the sixteen entries
 * in `common/permissions.ts` exist to make, and the one the API was not making. Content Manager,
 * Operations Officer and Finance Manager are all seeded as `UserRole.ADMIN`
 * (`prisma/seed.ts`), so a role check alone let a Content Manager release escrow.
 *
 * **It fails closed.** An operator on a route that `@Roles` opens to operators but that declares
 * no privilege is refused, not admitted. Adding a privileged endpoint and forgetting the
 * declaration therefore breaks that endpoint rather than quietly publishing it — and
 * `operator-routes.spec.ts` fails the build before it can reach an environment, because a guard
 * cannot fail closed on a route it was never mounted on.
 *
 * **Privileges are an operator concept.** `ROLE_DEFAULT_PERMISSIONS` gives BUYER, SELLER and
 * PROFESSIONAL the empty set by design, so a privilege check against them can only ever deny.
 * A non-operator caller that `@Roles` already admitted is therefore passed through untouched;
 * without that, the one route open to both — a professional filing their own DD report, which
 * operators may also file — could not be expressed at all.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declaration = this.read(context);
    const declaresPrivilege = declaration.all.length > 0 || declaration.any.length > 0;

    // Nothing to enforce: not gated on an operator role and naming no privilege. Route-level
    // authorization here belongs to the handler, as it does for `GET /escrow/:transactionId`.
    if (!declaration.reachableByOperators && !declaresPrivilege) return true;

    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      ip?: string;
      method?: string;
      originalUrl?: string;
      url?: string;
    }>();
    const user = request.user;
    if (!user) throw new ForbiddenException("Authentication required");

    // A buyer, seller or professional admitted by `@Roles` holds no privileges and is not
    // measured against them. See the class comment.
    if (!isInternalRole(user.role)) return true;

    const route = `${context.getClass().name}.${context.getHandler().name}`;

    if (!declaresPrivilege) {
      // Fail closed. The route is operator-facing and says nothing about what it costs.
      this.logger.error(
        `${route} admits operators but declares no privilege — denying. ` +
          `Add @RequirePermissions to it (E4-S1).`,
      );
      throw new ForbiddenException(
        `${route} declares no required privilege, so it is refused to operators`,
      );
    }

    const effective = await this.permissions.getEffectivePermissions(user.sub, user.role);

    if (declaration.all.length && !hasPermission(effective, declaration.all)) {
      const missing = declaration.all.filter((p) => !effective.includes(p));
      throw new ForbiddenException(`Missing privilege: ${missing.join(", ")}`);
    }

    if (declaration.any.length && !declaration.any.some((p) => effective.includes(p))) {
      throw new ForbiddenException(
        `Missing privilege: one of ${declaration.any.join(", ")} is required`,
      );
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      await this.recordSuperAdminBypass(user, route, declaration, request);
    }

    return true;
  }

  /** Handler declarations override class-level ones, matching how `@Roles` already behaves. */
  private read(context: ExecutionContext): RouteDeclaration {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);
    return {
      all: this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets) ?? [],
      any: this.reflector.getAllAndOverride<Permission[]>(ANY_PERMISSIONS_KEY, targets) ?? [],
      reachableByOperators: (roles ?? []).some(isInternalRole),
    };
  }

  /**
   * The super admin bypass, made accountable.
   *
   * `resolvePermissions` returns every privilege for `SUPER_ADMIN` before it reads a single
   * grant, so the account passes checks it was never granted. That is deliberate — it is the
   * account that can restore access when the privilege data itself is wrong — but it means the
   * privilege system cannot constrain it, and the only remaining control is a record of use.
   *
   * Every super admin pass is recorded, not only the ones where the bypass changed the outcome.
   * Telling those apart would need a second query per request to resolve what the account would
   * have held without it, and the question a reviewer actually asks is "what did the unconstrained
   * account do", which this answers. Writes go through `AuditService`, which never throws, so a
   * failed record degrades to a warning and does not deny a request that privileges allowed.
   */
  private async recordSuperAdminBypass(
    user: JwtPayload,
    route: string,
    declaration: RouteDeclaration,
    request: { ip?: string; method?: string; originalUrl?: string; url?: string },
  ): Promise<void> {
    await this.audit.log({
      actorId: user.sub,
      action: AuditAction.SUPER_ADMIN_PRIVILEGE_BYPASS,
      entity: "PrivilegedRoute",
      entityId: route,
      after: {
        method: request.method ?? "",
        path: request.originalUrl ?? request.url ?? "",
        requiredAll: declaration.all,
        requiredAny: declaration.any,
      },
      ipAddress: request.ip ?? null,
    });
  }
}
