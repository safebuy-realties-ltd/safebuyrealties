import { SetMetadata } from "@nestjs/common";
import type { Permission } from "../permissions";

export const PERMISSIONS_KEY = "permissions";
export const ANY_PERMISSIONS_KEY = "permissions:any";

/**
 * Require every listed privilege, in addition to any `@Roles` check.
 *
 * `@Roles` says which kind of account may reach a route; this says which privilege an operator
 * account must hold to use it. Both are needed on an operator route — `PermissionsGuard` refuses
 * an operator caller on a route that declares no privilege rather than waving them through.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Require at least one of the listed privileges.
 *
 * For reads that legitimately serve two audiences, where requiring both would lock out one of
 * them. `GET /admin/roles` is the case that forced it: the role editor reads it under
 * `roles.manage`, and the user screen reads the same list to populate its admin-role dropdown
 * under `users.read`. Requiring both would close the user screen to every seeded role except
 * Super Administrator, which is not what the nav already shows.
 *
 * Prefer `RequirePermissions`. An `any-of` list is a wider door and should name why it is wide.
 */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
