import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
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
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth, dashboardPathForRole, type Role } from "@/lib/auth";
import { NotificationBell } from "@/components/dashboard/NotificationBell";

export type NavItem = { label: string; to: string; icon: LucideIcon };

export const navByRole: Record<Role, NavItem[]> = {
  buyer: [
    { label: "Overview", to: "/dashboard/buyer", icon: LayoutDashboard },
    { label: "Browse Listings", to: "/dashboard/buyer/listings", icon: Building2 },
    { label: "Saved Properties", to: "/dashboard/buyer/saved", icon: Heart },
    { label: "Transactions", to: "/dashboard/buyer/transactions", icon: FileText },
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
    { label: "Credentials", to: "/dashboard/professional/credentials", icon: BadgeCheck },
    { label: "Reports", to: "/dashboard/professional/tasks", icon: FileText },
  ],
  staff: [
    { label: "Overview", to: "/dashboard/staff", icon: LayoutDashboard },
    { label: "Submissions", to: "/dashboard/staff/submissions", icon: ClipboardList },
    { label: "Credentials", to: "/dashboard/staff/credentials", icon: BadgeCheck },
    { label: "KYC Reviews", to: "/dashboard/staff/kyc", icon: Users },
    { label: "Workflow", to: "/dashboard/staff/workflow", icon: FileText },
    { label: "Inspections", to: "/dashboard/staff/inspections", icon: Calendar },
  ],
  admin: [
    { label: "Overview", to: "/dashboard/admin", icon: LayoutDashboard },
    { label: "Users", to: "/dashboard/admin/users", icon: Users },
    { label: "Listings", to: "/dashboard/admin/listings", icon: Building2 },
    { label: "Escrow", to: "/dashboard/admin/escrows", icon: Landmark },
    { label: "Settings", to: "/dashboard/admin/settings", icon: Settings },
  ],
};

const roleLabels: Record<Role, string> = {
  buyer: "Buyer",
  seller: "Seller",
  professional: "Professional",
  staff: "Staff",
  admin: "Administrator",
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

export function DashboardLayout({ role, children }: { role: Role; children?: React.ReactNode }) {
  const items = navByRole[role];
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isAuthenticated, isReady, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated) {
      navigate({ to: "/login" });
      return;
    }
    if (user && user.role !== role) {
      navigate({ to: dashboardPathForRole(user.role) });
    }
  }, [isReady, isAuthenticated, user, role, navigate]);

  if (!isReady || !isAuthenticated || !user || user.role !== role) {
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

  return (
    <div className="flex min-h-screen bg-secondary/30">
      <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-background md:flex md:flex-col">
        <div className="flex h-16 items-center border-b border-border/60 px-6">
          <Logo />
        </div>
        <div className="px-4 py-4">
          <p className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {roleLabels[role]} workspace
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary-soft text-primary font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/60 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary-soft text-primary text-xs font-semibold">
                {initialsOf(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabels[role]}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-6 backdrop-blur-xl">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search listings, tasks, documents…"
                className="h-9 pl-9 bg-secondary/50 border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={handleLogout}
              className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
