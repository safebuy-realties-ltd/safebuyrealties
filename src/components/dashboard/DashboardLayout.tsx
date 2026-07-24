import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Building2,
  FileText,
  ClipboardList,
  Users,
  Settings,
  BadgeCheck,
  Search,
  LogOut,
  ShoppingCart,
  Landmark,
  Heart,
  Calendar,
  ListChecks,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  useAuth,
  dashboardPathForRole,
  canAccessDashboardRole,
  loginPathForRole,
  type Role,
} from "@/lib/auth";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { hasPermission, isInternalPortalRole, PERMISSIONS } from "@/lib/permissions";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  requiredPermissions?: string[];
  permissionMode?: "any" | "all";
};

/** Unified company admin portal nav — visibility is privilege-driven. */
export const adminPortalNav: NavItem[] = [
  { label: "Overview", to: "/dashboard/admin", icon: LayoutDashboard },
  {
    label: "Users",
    to: "/dashboard/admin/users",
    icon: Users,
    requiredPermissions: [PERMISSIONS.USERS_READ],
  },
  {
    label: "Roles & Privileges",
    to: "/dashboard/admin/roles",
    icon: Shield,
    requiredPermissions: [PERMISSIONS.ROLES_MANAGE],
  },
  {
    label: "Submissions",
    to: "/dashboard/admin/submissions",
    icon: ClipboardList,
    requiredPermissions: [PERMISSIONS.STAFF_OPS],
  },
  {
    label: "Credentials",
    to: "/dashboard/admin/credentials",
    icon: BadgeCheck,
    requiredPermissions: [PERMISSIONS.STAFF_OPS],
  },
  {
    label: "KYC Reviews",
    to: "/dashboard/admin/kyc",
    icon: Users,
    requiredPermissions: [PERMISSIONS.STAFF_OPS],
  },
  {
    label: "Workflow",
    to: "/dashboard/admin/workflow",
    icon: FileText,
    requiredPermissions: [PERMISSIONS.STAFF_OPS],
  },
  {
    label: "Due Diligence",
    to: "/dashboard/admin/due-diligence",
    icon: ClipboardList,
    requiredPermissions: [PERMISSIONS.DD_ORDERS_READ, PERMISSIONS.STAFF_OPS],
    permissionMode: "any",
  },
  {
    label: "Inspections",
    to: "/dashboard/admin/inspections",
    icon: Calendar,
    requiredPermissions: [PERMISSIONS.STAFF_OPS],
  },
  {
    label: "Listings",
    to: "/dashboard/admin/listings",
    icon: Building2,
    requiredPermissions: [PERMISSIONS.LISTINGS_READ],
  },
  {
    label: "Escrow",
    to: "/dashboard/admin/escrows",
    icon: Landmark,
    requiredPermissions: [PERMISSIONS.ESCROWS_READ],
  },
  {
    label: "DD Checklists",
    to: "/dashboard/admin/checklists",
    icon: ListChecks,
    requiredPermissions: [PERMISSIONS.DD_CHECKLISTS_MANAGE],
  },
  {
    label: "Settings",
    to: "/dashboard/admin/settings",
    icon: Settings,
    requiredPermissions: [PERMISSIONS.PLATFORM_CONFIG],
  },
];

export const navByRole: Record<Role, NavItem[]> = {
  buyer: [
    { label: "Overview", to: "/dashboard/buyer", icon: LayoutDashboard },
    { label: "Browse Listings", to: "/dashboard/buyer/listings", icon: Building2 },
    { label: "Saved Properties", to: "/dashboard/buyer/saved", icon: Heart },
    { label: "Transactions", to: "/dashboard/buyer/transactions", icon: FileText },
    { label: "Due Diligence", to: "/dashboard/buyer/due-diligence", icon: ClipboardList },
    { label: "Verify Identity", to: "/dashboard/buyer/kyc", icon: BadgeCheck },
    { label: "Services", to: "/dashboard/buyer/services", icon: ShoppingCart },
  ],
  seller: [
    { label: "Overview", to: "/dashboard/seller", icon: LayoutDashboard },
    { label: "My Listings", to: "/dashboard/seller/listings", icon: Building2 },
    { label: "Documents", to: "/dashboard/seller/documents", icon: FileText },
  ],
  professional: [
    { label: "Overview", to: "/dashboard/professional", icon: LayoutDashboard },
    { label: "Assigned Tasks", to: "/dashboard/professional/tasks", icon: ClipboardList },
    { label: "Due Diligence", to: "/dashboard/professional/due-diligence", icon: FileText },
    { label: "Credentials", to: "/dashboard/professional/credentials", icon: BadgeCheck },
  ],
  // All company operators share the unified admin portal nav.
  staff: adminPortalNav,
  admin: adminPortalNav,
  super_admin: adminPortalNav,
};

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U"
  );
}

function filterNavItems(items: NavItem[], userPermissions: string[] | undefined): NavItem[] {
  if (!userPermissions || userPermissions.length === 0) return items;
  return items.filter((item) => {
    if (!item.requiredPermissions?.length) return true;
    return hasPermission(userPermissions, item.requiredPermissions, item.permissionMode ?? "all");
  });
}

function displayRoleLabel(user: {
  role: Role;
  adminRole?: { name: string } | null;
}): string {
  if (user.adminRole?.name) return user.adminRole.name;
  if (user.role === "super_admin") return "Super Administrator";
  if (user.role === "admin") return "Administrator";
  if (user.role === "staff") return "Operations";
  return user.role.replace(/_/g, " ");
}

export function DashboardLayout({ role, children }: { role: Role; children?: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isAuthenticated, isReady, logout } = useAuth();
  const navigate = useNavigate();

  // Internal operators always use the unified admin nav, regardless of layout role.
  const navRole: Role =
    user && isInternalPortalRole(user.role)
      ? "admin"
      : role;
  const items = useMemo(
    () => filterNavItems(navByRole[navRole], user?.permissions),
    [navRole, user?.permissions],
  );
  const hasAccess = user ? canAccessDashboardRole(user.role, role) : false;
  const workspaceLabel = isInternalPortalRole(role)
    ? "ADMIN PORTAL"
    : `${role.replace(/_/g, " ").toUpperCase()} WORKSPACE`;

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated) {
      navigate({
        to: loginPathForRole(role),
        search: { redirect: pathname.startsWith("/dashboard") ? pathname : undefined },
      });
      return;
    }
    if (user && !canAccessDashboardRole(user.role, role)) {
      navigate({ to: dashboardPathForRole(user.role) });
    }
  }, [isReady, isAuthenticated, user, role, navigate, pathname]);

  if (!isReady || !isAuthenticated || !user || !hasAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30">
        <div className="text-sm text-muted-foreground">Loading workspace…</div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/" });
  };

  const roleTitle = displayRoleLabel(user);

  return (
    <div className="flex min-h-screen bg-secondary/20">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border p-4">
          <Logo />
          <p className="mt-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">
            {workspaceLabel}
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((item) => {
            const active =
              pathname === item.to ||
              (item.to !== "/dashboard/admin" &&
                item.to !== "/dashboard/buyer" &&
                item.to !== "/dashboard/seller" &&
                item.to !== "/dashboard/professional" &&
                pathname.startsWith(`${item.to}/`)) ||
              (item.to === "/dashboard/admin" && pathname === "/dashboard/admin/");
            return (
              <Link
                key={item.to + item.label}
                to={item.to}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary-soft font-medium text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initialsOf(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{roleTitle}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder="Search listings, tasks, documents..."
              aria-label="Search"
            />
          </div>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
