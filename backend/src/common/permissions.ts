import { UserRole } from "@prisma/client";

/** Fine-grained capabilities for the admin/ops platform. */
export const PERMISSIONS = {
  USERS_READ: "users.read",
  USERS_WRITE: "users.write",
  LISTINGS_READ: "listings.read",
  LISTINGS_WRITE: "listings.write",
  DD_ORDERS_READ: "dd.orders.read",
  DD_ORDERS_WRITE: "dd.orders.write",
  DD_CHECKLISTS_MANAGE: "dd.checklists.manage",
  CATALOG_MANAGE: "catalog.manage",
  PLATFORM_CONFIG: "platform.config",
  ESCROWS_READ: "escrows.read",
  ESCROWS_WRITE: "escrows.write",
  ANALYTICS_READ: "analytics.read",
  CONTENT_MANAGE: "content.manage",
  STAFF_OPS: "staff.ops",
  PERMISSIONS_MANAGE: "permissions.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

const STAFF_DEFAULTS: Permission[] = [
  PERMISSIONS.STAFF_OPS,
  PERMISSIONS.DD_ORDERS_READ,
  PERMISSIONS.DD_ORDERS_WRITE,
  PERMISSIONS.LISTINGS_READ,
  PERMISSIONS.LISTINGS_WRITE,
  PERMISSIONS.USERS_READ,
];

const ADMIN_DEFAULTS: Permission[] = ALL_PERMISSIONS.filter(
  (p) => p !== PERMISSIONS.PERMISSIONS_MANAGE,
);

/** Role defaults when the user has no custom PermissionGrant rows. */
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  BUYER: [],
  SELLER: [],
  PROFESSIONAL: [],
  STAFF: STAFF_DEFAULTS,
  ADMIN: ADMIN_DEFAULTS,
  SUPER_ADMIN: ALL_PERMISSIONS,
};

export function resolvePermissions(
  role: UserRole,
  grants: string[],
): Permission[] {
  if (role === UserRole.SUPER_ADMIN) return [...ALL_PERMISSIONS];
  if (grants.length > 0) {
    const known = new Set(ALL_PERMISSIONS);
    return grants.filter((g): g is Permission => known.has(g as Permission));
  }
  return [...ROLE_DEFAULT_PERMISSIONS[role]];
}

export function hasPermission(
  effective: readonly string[],
  required: Permission | Permission[],
): boolean {
  const need = Array.isArray(required) ? required : [required];
  return need.every((p) => effective.includes(p));
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.USERS_READ]: "View users",
  [PERMISSIONS.USERS_WRITE]: "Manage users",
  [PERMISSIONS.LISTINGS_READ]: "View listings",
  [PERMISSIONS.LISTINGS_WRITE]: "Manage listings",
  [PERMISSIONS.DD_ORDERS_READ]: "View DD cases",
  [PERMISSIONS.DD_ORDERS_WRITE]: "Manage DD cases",
  [PERMISSIONS.DD_CHECKLISTS_MANAGE]: "Customize DD checklists",
  [PERMISSIONS.CATALOG_MANAGE]: "Manage service catalog",
  [PERMISSIONS.PLATFORM_CONFIG]: "Platform settings",
  [PERMISSIONS.ESCROWS_READ]: "View escrows",
  [PERMISSIONS.ESCROWS_WRITE]: "Manage escrows",
  [PERMISSIONS.ANALYTICS_READ]: "View analytics",
  [PERMISSIONS.CONTENT_MANAGE]: "Manage content",
  [PERMISSIONS.STAFF_OPS]: "Staff operations",
  [PERMISSIONS.PERMISSIONS_MANAGE]: "Assign permissions",
};
