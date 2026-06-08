import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Landmark, Settings, Users, Workflow } from "lucide-react";
import { PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import {
  ListingsByStatusChart,
  TransactionsTrendChart,
  UserRoleDistributionChart,
} from "@/components/dashboard/AdminAnalyticsCharts";
import { Button } from "@/components/ui/button";
import { useAdminAnalyticsQuery } from "@/hooks/use-admin-analytics";

export const Route = createFileRoute("/dashboard/super-admin/")({
  component: SuperAdminCommandCenter,
});

const quickLinks = [
  {
    title: "User management",
    description: "Create accounts, assign roles, and suspend access.",
    to: "/dashboard/admin/users",
    icon: Users,
  },
  {
    title: "Platform settings",
    description: "Feature flags, compliance defaults, and global config.",
    to: "/dashboard/admin/settings",
    icon: Settings,
  },
  {
    title: "Escrow oversight",
    description: "Monitor held funds and release milestones.",
    to: "/dashboard/admin/escrows",
    icon: Landmark,
  },
  {
    title: "Staff workflow",
    description: "Jump into verification queues and assignment tools.",
    to: "/dashboard/staff/workflow",
    icon: Workflow,
  },
] as const;

function SuperAdminCommandCenter() {
  const { data: analytics, isLoading, isError } = useAdminAnalyticsQuery();

  const formatRevenue = (raw: string | undefined) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw ?? "—";
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(n);
  };

  return (
    <>
      <PageHeader
        title="Decision center"
        description="Command center for platform health, persona mix, and operational queues. Use the charts below to spot bottlenecks before they reach buyers and sellers."
        actions={
          <Button size="sm" asChild>
            <Link to="/dashboard/admin/users">Manage users</Link>
          </Button>
        }
      />

      <div className="mb-8 rounded-xl border border-primary/20 bg-primary-soft/30 p-5">
        <p className="text-sm font-medium text-foreground">Super-admin decision center</p>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Prioritize staffing on verification backlogs, watch listing pipeline conversion, and keep
          role distribution balanced as you onboard new partners. Quick links on the right take you
          to the screens where you can act.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Listings (total)"
          value={isLoading ? "…" : String(analytics?.totalListings ?? "—")}
          hint={`${analytics?.liveListings ?? "—"} live`}
        />
        <StatCard
          label="Transactions"
          value={isLoading ? "…" : String(analytics?.totalTransactions ?? "—")}
          hint={
            analytics?.recentTransactionsCount != null
              ? `${analytics.recentTransactionsCount} last 7 days`
              : "All time"
          }
        />
        <StatCard
          label="DD revenue"
          value={isLoading ? "…" : formatRevenue(analytics?.totalDdRevenue)}
          hint="Paid DD orders"
        />
        <StatCard
          label="Pending KYC"
          value={isLoading ? "…" : String(analytics?.pendingKyc ?? "—")}
          hint="Awaiting review"
        />
        <StatCard
          label="Pending verifications"
          value={isLoading ? "…" : String(analytics?.pendingVerifications ?? "—")}
          hint="In pipeline"
        />
        <StatCard
          label="Users (roles)"
          value={
            isLoading
              ? "…"
              : String(
                  Object.values(analytics?.usersByRole ?? {}).reduce((a, b) => a + b, 0) || "—",
                )
          }
          hint="Across all personas"
        />
      </div>

      {isError && (
        <p className="mt-4 text-sm text-destructive">Could not load platform analytics.</p>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <ListingsByStatusChart analytics={analytics} />
        <UserRoleDistributionChart analytics={analytics} />
        <TransactionsTrendChart analytics={analytics} />
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
          <h3 className="text-sm font-semibold text-foreground">Quick links</h3>
          <p className="mt-1 text-xs text-muted-foreground">Jump to high-impact admin surfaces</p>
          <ul className="mt-4 space-y-3">
            {quickLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="group flex items-start gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-secondary/50"
                >
                  <link.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{link.title}</p>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
