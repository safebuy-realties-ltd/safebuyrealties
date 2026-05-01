import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  FileText,
  ClipboardList,
  Users,
  Settings,
  Bell,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export type NavItem = { label: string; to: string; icon: LucideIcon };

export const navByRole: Record<string, NavItem[]> = {
  buyer: [
    { label: "Overview", to: "/dashboard/buyer", icon: LayoutDashboard },
    { label: "Browse Listings", to: "/dashboard/buyer/listings", icon: Building2 },
    { label: "Transactions", to: "/dashboard/buyer/transactions", icon: FileText },
  ],
  seller: [
    { label: "Overview", to: "/dashboard/seller", icon: LayoutDashboard },
    { label: "My Listings", to: "/dashboard/seller/listings", icon: Building2 },
    { label: "Documents", to: "/dashboard/seller/documents", icon: FileText },
  ],
  professional: [
    { label: "Overview", to: "/dashboard/professional", icon: LayoutDashboard },
    { label: "Assigned Tasks", to: "/dashboard/professional/tasks", icon: ClipboardList },
    { label: "Reports", to: "/dashboard/professional/reports", icon: FileText },
  ],
  staff: [
    { label: "Overview", to: "/dashboard/staff", icon: LayoutDashboard },
    { label: "Submissions", to: "/dashboard/staff/submissions", icon: ClipboardList },
    { label: "Workflow", to: "/dashboard/staff/workflow", icon: FileText },
  ],
  admin: [
    { label: "Overview", to: "/dashboard/admin", icon: LayoutDashboard },
    { label: "Users", to: "/dashboard/admin/users", icon: Users },
    { label: "Listings", to: "/dashboard/admin/listings", icon: Building2 },
    { label: "Settings", to: "/dashboard/admin/settings", icon: Settings },
  ],
};

const roleLabels: Record<string, string> = {
  buyer: "Buyer",
  seller: "Seller",
  professional: "Professional",
  staff: "Staff",
  admin: "Administrator",
};

export function DashboardLayout({ role, children }: { role: keyof typeof navByRole; children?: React.ReactNode }) {
  const items = navByRole[role];
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
              <AvatarFallback className="bg-primary-soft text-primary text-xs font-semibold">SB</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">Sam Brooks</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabels[role]}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-6 backdrop-blur-xl">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search listings, tasks, documents…" className="h-9 pl-9 bg-secondary/50 border-transparent" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
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
