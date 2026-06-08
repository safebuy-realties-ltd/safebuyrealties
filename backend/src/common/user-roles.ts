import { UserRole } from "@prisma/client";

/** STAFF, ADMIN, or SUPER_ADMIN — platform operators with elevated access. */
export function isInternalRole(role: UserRole): boolean {
  return (
    role === UserRole.STAFF || role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN
  );
}

/** ADMIN or SUPER_ADMIN. */
export function isAdminRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

export function isSuperAdmin(role: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN;
}

/** Whether `userRole` satisfies any of the required roles (SUPER_ADMIN inherits ADMIN/STAFF). */
export function roleSatisfies(userRole: UserRole, required: UserRole[]): boolean {
  if (required.includes(userRole)) return true;
  if (userRole === UserRole.SUPER_ADMIN) {
    return required.includes(UserRole.ADMIN) || required.includes(UserRole.STAFF);
  }
  return false;
}
