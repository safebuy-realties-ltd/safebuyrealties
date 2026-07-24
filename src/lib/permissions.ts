/** Frontend privilege catalog for the unified admin portal. */
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
  ROLES_MANAGE: "roles.manage",
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
  [PERMISSIONS.STAFF_OPS]: "Operations queues (submissions, KYC, workflow, inspections)",
  [PERMISSIONS.PERMISSIONS_MANAGE]: "Assign user privileges",
  [PERMISSIONS.ROLES_MANAGE]: "Manage admin roles",
};

/** Dashboard areas unlocked by each privilege. */
export const PERMISSION_NAV_UNLOCKS: Record<PermissionCode, string[]> = {
  [PERMISSIONS.USERS_READ]: ["Users"],
  [PERMISSIONS.USERS_WRITE]: ["Users (create / edit)"],
  [PERMISSIONS.LISTINGS_READ]: ["Listings"],
  [PERMISSIONS.LISTINGS_WRITE]: ["Listings (moderate)"],
  [PERMISSIONS.DD_ORDERS_READ]: ["Due Diligence queue"],
  [PERMISSIONS.DD_ORDERS_WRITE]: ["Due Diligence (assign / complete)"],
  [PERMISSIONS.DD_CHECKLISTS_MANAGE]: ["DD Checklists CMS"],
  [PERMISSIONS.CATALOG_MANAGE]: ["Service catalog pricing"],
  [PERMISSIONS.PLATFORM_CONFIG]: ["Platform Settings"],
  [PERMISSIONS.ESCROWS_READ]: ["Escrow"],
  [PERMISSIONS.ESCROWS_WRITE]: ["Escrow (actions)"],
  [PERMISSIONS.ANALYTICS_READ]: ["Overview analytics"],
  [PERMISSIONS.CONTENT_MANAGE]: ["Content tools"],
  [PERMISSIONS.STAFF_OPS]: [
    "Submissions",
    "Credentials review",
    "KYC Reviews",
    "Verification Workflow",
    "Inspections",
  ],
  [PERMISSIONS.PERMISSIONS_MANAGE]: ["Assign user privileges"],
  [PERMISSIONS.ROLES_MANAGE]: ["Admin Roles"],
};

export const ALL_PERMISSION_CODES = Object.values(PERMISSIONS);

/** Empty/undefined permissions → allow (legacy sessions). Non-empty → enforce. */
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
  return hasPermission(actorPermissions, PERMISSIONS.PERMISSIONS_MANAGE);
}

export function canManageAdminRoles(
  actorRole: string | undefined,
  actorPermissions: string[] | undefined,
): boolean {
  if (actorRole === "super_admin") return true;
  return hasPermission(actorPermissions, PERMISSIONS.ROLES_MANAGE);
}

export function isInternalPortalRole(role: string | undefined): boolean {
  return role === "staff" || role === "admin" || role === "super_admin";
}
