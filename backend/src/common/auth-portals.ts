import { UserRole } from "@prisma/client";

export const AUTH_PORTALS = ["buyer", "seller", "professional", "admin"] as const;
export type AuthPortal = (typeof AUTH_PORTALS)[number];

/** Roles accepted by each branded login portal. */
export const PORTAL_ALLOWED_ROLES: Record<AuthPortal, UserRole[]> = {
  buyer: [UserRole.BUYER],
  seller: [UserRole.SELLER],
  professional: [UserRole.PROFESSIONAL],
  admin: [UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN],
};

export function isAuthPortal(value: unknown): value is AuthPortal {
  return typeof value === "string" && (AUTH_PORTALS as readonly string[]).includes(value);
}

export function portalAcceptsRole(portal: AuthPortal, role: UserRole): boolean {
  return PORTAL_ALLOWED_ROLES[portal].includes(role);
}

export function loginPathForRole(role: UserRole): string {
  switch (role) {
    case UserRole.BUYER:
      return "/login/buyer";
    case UserRole.SELLER:
      return "/login/seller";
    case UserRole.PROFESSIONAL:
      return "/login/professional";
    case UserRole.STAFF:
    case UserRole.ADMIN:
    case UserRole.SUPER_ADMIN:
      return "/login/admin";
    default:
      return "/login";
  }
}
