import { UserRole } from "@prisma/client";

/** Fine-grained capabilities for the unified admin portal. */
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

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** What each privilege unlocks in the unified admin dashboard. */
export const PERMISSION_NAV_UNLOCKS: Record<Permission, string[]> = {
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
  [PERMISSIONS.ROLES_MANAGE]: ["Admin Roles (create / edit privilege sets)"],
};

const OPS_DEFAULTS: Permission[] = [
  PERMISSIONS.STAFF_OPS,
  PERMISSIONS.DD_ORDERS_READ,
  PERMISSIONS.DD_ORDERS_WRITE,
  PERMISSIONS.LISTINGS_READ,
  PERMISSIONS.LISTINGS_WRITE,
  PERMISSIONS.USERS_READ,
  PERMISSIONS.ANALYTICS_READ,
];

const ADMIN_DEFAULTS: Permission[] = ALL_PERMISSIONS.filter(
  (p) => p !== PERMISSIONS.PERMISSIONS_MANAGE && p !== PERMISSIONS.ROLES_MANAGE,
);

/** Role defaults when the user has no AdminRole and no custom PermissionGrant rows. */
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  BUYER: [],
  SELLER: [],
  PROFESSIONAL: [],
  STAFF: OPS_DEFAULTS,
  ADMIN: ADMIN_DEFAULTS,
  SUPER_ADMIN: ALL_PERMISSIONS,
};

export function resolvePermissions(
  role: UserRole,
  grants: string[],
  adminRolePermissions?: string[] | null,
): Permission[] {
  if (role === UserRole.SUPER_ADMIN) return [...ALL_PERMISSIONS];
  const known = new Set(ALL_PERMISSIONS);

  // Per-user grants override everything (except super admin handled above)
  if (grants.length > 0) {
    return grants.filter((g): g is Permission => known.has(g as Permission));
  }

  // Named org role privileges
  if (adminRolePermissions && adminRolePermissions.length > 0) {
    return adminRolePermissions.filter((g): g is Permission => known.has(g as Permission));
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
  [PERMISSIONS.STAFF_OPS]: "Operations queues (submissions, KYC, workflow, inspections)",
  [PERMISSIONS.PERMISSIONS_MANAGE]: "Assign user privileges",
  [PERMISSIONS.ROLES_MANAGE]: "Manage admin roles",
};

/** Seed templates for the unified company portal. */
export const DEFAULT_ADMIN_ROLE_TEMPLATES: {
  name: string;
  description: string;
  permissions: Permission[];
  isSystem?: boolean;
  sortOrder: number;
}[] = [
  {
    name: "Super Administrator",
    description: "Full platform control — CEO / founding authority.",
    permissions: ALL_PERMISSIONS,
    isSystem: true,
    sortOrder: 0,
  },
  {
    name: "Platform Administrator",
    description: "Day-to-day platform management across users, listings, and ops.",
    permissions: ADMIN_DEFAULTS,
    sortOrder: 1,
  },
  {
    name: "Operations Officer",
    description: "Listing submissions, verification workflow, KYC, and inspections.",
    permissions: OPS_DEFAULTS,
    sortOrder: 2,
  },
  {
    name: "Due Diligence Lead",
    description: "DD case queue, assignments, and checklist customization.",
    permissions: [
      PERMISSIONS.DD_ORDERS_READ,
      PERMISSIONS.DD_ORDERS_WRITE,
      PERMISSIONS.DD_CHECKLISTS_MANAGE,
      PERMISSIONS.STAFF_OPS,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.ANALYTICS_READ,
    ],
    sortOrder: 3,
  },
  {
    name: "Finance Manager",
    description: "Escrow oversight and revenue analytics.",
    permissions: [
      PERMISSIONS.ESCROWS_READ,
      PERMISSIONS.ESCROWS_WRITE,
      PERMISSIONS.ANALYTICS_READ,
      PERMISSIONS.USERS_READ,
    ],
    sortOrder: 4,
  },
  {
    name: "Content Manager",
    description: "DD checklist CMS, catalog, and content configuration.",
    permissions: [
      PERMISSIONS.CONTENT_MANAGE,
      PERMISSIONS.DD_CHECKLISTS_MANAGE,
      PERMISSIONS.CATALOG_MANAGE,
      PERMISSIONS.ANALYTICS_READ,
    ],
    sortOrder: 5,
  },
];
