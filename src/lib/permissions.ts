/** Frontend permission codes (mirror backend `common/permissions.ts`). */
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

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LABELS: Record<PermissionCode, string> = {
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

/** Backward compatible: empty/undefined permissions → allow (legacy full access). */
export function hasPermission(
  userPermissions: string[] | undefined,
  required: string | string[],
  mode: "any" | "all" = "all",
): boolean {
  if (!userPermissions || userPermissions.length === 0) return true;
  const need = Array.isArray(required) ? required : [required];
  if (mode === "any") return need.some((p) => userPermissions.includes(p));
  return need.every((p) => userPermissions.includes(p));
}

export function canManageUserPermissions(
  actorRole: string | undefined,
  actorPermissions: string[] | undefined,
): boolean {
  if (actorRole === "super_admin") return true;
  if (actorRole !== "admin") return false;
  return hasPermission(actorPermissions, PERMISSIONS.PERMISSIONS_MANAGE);
}
