import { Controller, ExecutionContext, ForbiddenException, Get } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { AdminRolesController } from "../../admin-roles/admin-roles.controller";
import { EscrowController } from "../../escrow/escrow.controller";
import { StandaloneDdController } from "../../standalone-dd/standalone-dd.controller";
import { AuditAction } from "../../audit/audit-actions.constants";
import type { AuditService } from "../../audit/audit.service";
import type { PermissionsService } from "../../permissions/permissions.service";
import type { JwtPayload } from "../../auth/jwt.strategy";
import { RequireAnyPermission, RequirePermissions } from "../decorators/permissions.decorator";
import { Roles } from "../decorators/roles.decorator";
import { PERMISSIONS, type Permission } from "../permissions";
import { PermissionsGuard } from "./permissions.guard";
import type { ClassRef, HandlerRef } from "./route-inventory";

/**
 * Two routes that do not exist in the application, for the two cases the application should never
 * contain: an operator route that names no privilege, and one that names more than it can be
 * refused for in a single message. The real decorators are used, so `Reflector` reads them exactly
 * as it reads a shipped controller's.
 */
@Controller("test-fixtures")
@Roles(UserRole.STAFF, UserRole.ADMIN)
class UndeclaredRouteController {
  /** The mistake the guard has to survive: operator-facing, says nothing about what it costs. */
  @Get("forgotten")
  forgotten() {
    return null;
  }

  @Get("two-privileges")
  @RequirePermissions(PERMISSIONS.ESCROWS_WRITE, PERMISSIONS.PLATFORM_CONFIG)
  twoPrivileges() {
    return null;
  }

  @Get("neither")
  @RequireAnyPermission(PERMISSIONS.ESCROWS_READ, PERMISSIONS.ESCROWS_WRITE)
  eitherPrivilege() {
    return null;
  }
}

function user(role: UserRole, sub = "user-1"): JwtPayload {
  return { sub, email: `${sub}@safebuyrealties.test`, role, professionalType: null };
}

describe("PermissionsGuard", () => {
  let guard: PermissionsGuard;
  let effective: Permission[];
  let getEffectivePermissions: jest.Mock;
  let log: jest.Mock;

  beforeEach(() => {
    effective = [];
    getEffectivePermissions = jest.fn(async () => effective);
    log = jest.fn(async () => undefined);
    guard = new PermissionsGuard(
      new Reflector(),
      { getEffectivePermissions } as unknown as PermissionsService,
      { log } as unknown as AuditService,
    );
  });

  const request = (caller?: JwtPayload) => ({
    user: caller,
    ip: "203.0.113.9",
    method: "POST",
    originalUrl: "/api/v1/escrow/txn-1/release",
  });

  function contextFor(
    controller: ClassRef,
    handlerName: string,
    caller?: JwtPayload,
  ): ExecutionContext {
    const req = request(caller);
    return {
      getClass: () => controller,
      getHandler: () => (controller.prototype as Record<string, HandlerRef>)[handlerName],
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  // Criterion 1 — a route with no declaration fails closed rather than defaulting to allow.
  describe("a route that declares no privilege", () => {
    it("refuses an operator instead of waving them through", async () => {
      const context = contextFor(UndeclaredRouteController, "forgotten", user(UserRole.ADMIN));
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        "UndeclaredRouteController.forgotten declares no required privilege",
      );
    });

    it("does not spend a query working out what the caller holds", async () => {
      // Nothing the caller holds could change the answer, and a denial should not cost a round trip.
      await expect(
        guard.canActivate(contextFor(UndeclaredRouteController, "forgotten", user(UserRole.STAFF))),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(getEffectivePermissions).not.toHaveBeenCalled();
    });

    it("leaves a route that is not operator-facing alone", async () => {
      // `GET /escrow/:transactionId` has no `@Roles`: a buyer and a seller read their own escrow
      // and the service scopes the row. Failing closed here would break the buyer's escrow screen.
      const context = contextFor(EscrowController, "findOne", user(UserRole.BUYER));
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(getEffectivePermissions).not.toHaveBeenCalled();
    });
  });

  // Criterion 3 — the denial names the privilege.
  describe("denial", () => {
    it("names the missing privilege on an operator route", async () => {
      // A seeded Content Manager: UserRole.ADMIN, so RolesGuard admits them, and no escrows.write.
      effective = [
        PERMISSIONS.CONTENT_MANAGE,
        PERMISSIONS.DD_CHECKLISTS_MANAGE,
        PERMISSIONS.CATALOG_MANAGE,
        PERMISSIONS.ANALYTICS_READ,
      ];
      await expect(
        guard.canActivate(contextFor(EscrowController, "release", user(UserRole.ADMIN))),
      ).rejects.toThrow("Missing privilege: escrows.write");
    });

    it("names only the privileges the caller is actually short of", async () => {
      effective = [PERMISSIONS.ESCROWS_WRITE];
      await expect(
        guard.canActivate(
          contextFor(UndeclaredRouteController, "twoPrivileges", user(UserRole.ADMIN)),
        ),
      ).rejects.toThrow("Missing privilege: platform.config");
    });

    it("names the whole set when any one of them would have done", async () => {
      effective = [PERMISSIONS.CONTENT_MANAGE];
      await expect(
        guard.canActivate(
          contextFor(UndeclaredRouteController, "eitherPrivilege", user(UserRole.ADMIN)),
        ),
      ).rejects.toThrow("Missing privilege: one of escrows.read, escrows.write is required");
    });

    it("refuses an unauthenticated caller on a privileged route", async () => {
      await expect(
        guard.canActivate(contextFor(EscrowController, "release", undefined)),
      ).rejects.toThrow("Authentication required");
    });
  });

  describe("allowing", () => {
    it("lets an operator holding the privilege through", async () => {
      effective = [PERMISSIONS.ESCROWS_READ, PERMISSIONS.ESCROWS_WRITE, PERMISSIONS.ANALYTICS_READ];
      await expect(
        guard.canActivate(contextFor(EscrowController, "release", user(UserRole.ADMIN))),
      ).resolves.toBe(true);
    });

    it("accepts either side of an any-of declaration", async () => {
      // `GET /admin/roles` is read by the role editor under roles.manage and by the user screen,
      // which populates its admin-role dropdown, under users.read.
      effective = [PERMISSIONS.USERS_READ];
      await expect(
        guard.canActivate(contextFor(AdminRolesController, "list", user(UserRole.STAFF))),
      ).resolves.toBe(true);

      effective = [PERMISSIONS.ROLES_MANAGE];
      await expect(
        guard.canActivate(contextFor(AdminRolesController, "list", user(UserRole.ADMIN))),
      ).resolves.toBe(true);
    });

    it("passes a non-operator through a mixed-audience route untouched", async () => {
      // A professional files their own report; an operator may file it for them. BUYER, SELLER and
      // PROFESSIONAL hold the empty privilege set by design, so measuring them could only deny.
      await expect(
        guard.canActivate(
          contextFor(StandaloneDdController, "uploadAssignmentReport", user(UserRole.PROFESSIONAL)),
        ),
      ).resolves.toBe(true);
      expect(getEffectivePermissions).not.toHaveBeenCalled();
    });

    it("still measures the operator half of that same route", async () => {
      effective = [PERMISSIONS.CONTENT_MANAGE];
      await expect(
        guard.canActivate(
          contextFor(StandaloneDdController, "uploadAssignmentReport", user(UserRole.ADMIN)),
        ),
      ).rejects.toThrow("Missing privilege: dd.orders.write");
    });
  });

  // Criterion 4 — the super admin bypass is explicit, audited, and covered by a test.
  describe("super admin bypass", () => {
    it("records every pass, with the route and what it required", async () => {
      // `resolvePermissions` hands SUPER_ADMIN every privilege before it reads a grant, so the
      // privilege system cannot constrain this account. The remaining control is the record.
      effective = [PERMISSIONS.ESCROWS_WRITE];
      await expect(
        guard.canActivate(
          contextFor(EscrowController, "release", user(UserRole.SUPER_ADMIN, "root")),
        ),
      ).resolves.toBe(true);

      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith({
        actorId: "root",
        action: AuditAction.SUPER_ADMIN_PRIVILEGE_BYPASS,
        entity: "PrivilegedRoute",
        entityId: "EscrowController.release",
        after: {
          method: "POST",
          path: "/api/v1/escrow/txn-1/release",
          requiredAll: [PERMISSIONS.ESCROWS_WRITE],
          requiredAny: [],
        },
        ipAddress: "203.0.113.9",
      });
    });

    it("records the any-of case too", async () => {
      effective = [PERMISSIONS.ROLES_MANAGE];
      await guard.canActivate(contextFor(AdminRolesController, "list", user(UserRole.SUPER_ADMIN)));
      expect(log.mock.calls[0][0]).toMatchObject({
        entityId: "AdminRolesController.list",
        after: {
          requiredAll: [],
          requiredAny: [PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_READ],
        },
      });
    });

    it("writes nothing for an ordinary operator", async () => {
      effective = [PERMISSIONS.ESCROWS_WRITE];
      await guard.canActivate(contextFor(EscrowController, "release", user(UserRole.ADMIN)));
      expect(log).not.toHaveBeenCalled();
    });

    it("does not record a pass that never happened", async () => {
      // A denial is already recorded by the 403 itself; a bypass row for it would read as a
      // successful privileged action in the audit log.
      effective = [];
      await expect(
        guard.canActivate(contextFor(EscrowController, "release", user(UserRole.SUPER_ADMIN))),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(log).not.toHaveBeenCalled();
    });
  });
});
