import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AdminAnalyticsDto } from "@/hooks/use-admin-analytics";

const listingStatusConfig: ChartConfig = {
  live: { label: "Live", color: "hsl(var(--chart-1))" },
  pending_review: { label: "Pending review", color: "hsl(var(--chart-2))" },
  in_verification: { label: "In verification", color: "hsl(var(--chart-3))" },
  verified: { label: "Verified", color: "hsl(var(--chart-4))" },
  draft: { label: "Draft", color: "hsl(var(--chart-5))" },
  other: { label: "Other", color: "hsl(var(--muted-foreground))" },
};

const roleConfig: ChartConfig = {
  buyer: { label: "Buyers", color: "hsl(var(--chart-1))" },
  seller: { label: "Sellers", color: "hsl(var(--chart-2))" },
  professional: { label: "Professionals", color: "hsl(var(--chart-3))" },
  staff: { label: "Staff", color: "hsl(var(--chart-4))" },
  admin: { label: "Admins", color: "hsl(var(--chart-5))" },
  super_admin: { label: "Super admins", color: "hsl(var(--primary))" },
};

const queueConfig: ChartConfig = {
  pendingKyc: { label: "Pending KYC", color: "hsl(var(--chart-1))" },
  pendingVerifications: { label: "Pending verifications", color: "hsl(var(--chart-2))" },
};

const trendConfig: ChartConfig = {
  count: { label: "Transactions", color: "hsl(var(--chart-1))" },
};

function formatStatusLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function listingsChartData(analytics: AdminAnalyticsDto | undefined) {
  const byStatus = analytics?.listingsByStatus;
  if (byStatus && Object.keys(byStatus).length > 0) {
    return Object.entries(byStatus).map(([status, count]) => ({
      status,
      label: formatStatusLabel(status),
      count,
      fill: `var(--color-${listingStatusConfig[status] ? status : "other"})`,
    }));
  }
  const live = analytics?.liveListings ?? 0;
  const total = analytics?.totalListings ?? 0;
  const other = Math.max(0, total - live);
  return [
    { status: "live", label: "Live", count: live, fill: "var(--color-live)" },
    { status: "other", label: "Other", count: other, fill: "var(--color-other)" },
  ];
}

function usersByRoleData(analytics: AdminAnalyticsDto | undefined) {
  const byRole = analytics?.usersByRole;
  if (byRole && Object.keys(byRole).length > 0) {
    return Object.entries(byRole).map(([role, count]) => ({
      role,
      label: formatStatusLabel(role),
      count,
      fill: `var(--color-${roleConfig[role] ? role : "buyer"})`,
    }));
  }
  return [
    { role: "buyer", label: "Buyers", count: 0, fill: "var(--color-buyer)" },
    { role: "seller", label: "Sellers", count: 0, fill: "var(--color-seller)" },
  ];
}

/** Deterministic mock 7-day trend when API does not provide daily breakdown. */
function transactionTrendData(analytics: AdminAnalyticsDto | undefined) {
  const seed = analytics?.recentTransactionsCount ?? analytics?.totalTransactions ?? 12;
  const days: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      count: Math.max(0, Math.round((seed / 7) * (0.6 + ((i + seed) % 5) * 0.1))),
    });
  }
  return days;
}

function revenuePlaceholder(analytics: AdminAnalyticsDto | undefined) {
  const raw = Number(analytics?.totalDdRevenue ?? 0);
  const monthly = Number.isFinite(raw) ? raw / 12 : 0;
  return [
    { month: "Jan", revenue: monthly * 0.7 },
    { month: "Feb", revenue: monthly * 0.85 },
    { month: "Mar", revenue: monthly * 0.9 },
    { month: "Apr", revenue: monthly * 1.0 },
    { month: "May", revenue: monthly * 1.1 },
    { month: "Jun", revenue: monthly * 1.05 },
  ];
}

const revenueConfig: ChartConfig = {
  revenue: { label: "DD revenue (est.)", color: "hsl(var(--chart-2))" },
};

export function ListingsByStatusChart({ analytics }: { analytics?: AdminAnalyticsDto }) {
  const data = useMemo(() => listingsChartData(analytics), [analytics]);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-semibold text-foreground">Listings by status</h3>
      <p className="mt-1 text-xs text-muted-foreground">Distribution across pipeline stages</p>
      <ChartContainer config={listingStatusConfig} className="mt-4 h-[220px] w-full">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={100}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" radius={4}>
            {data.map((entry) => (
              <Cell key={entry.status} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export function UserRoleDistributionChart({ analytics }: { analytics?: AdminAnalyticsDto }) {
  const data = useMemo(() => usersByRoleData(analytics), [analytics]);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-semibold text-foreground">Users by role</h3>
      <p className="mt-1 text-xs text-muted-foreground">Platform persona mix</p>
      <ChartContainer config={roleConfig} className="mt-4 h-[220px] w-full">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="count" nameKey="role" innerRadius={50} outerRadius={80}>
            {data.map((entry) => (
              <Cell key={entry.role} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
    </div>
  );
}

export function TransactionsTrendChart({ analytics }: { analytics?: AdminAnalyticsDto }) {
  const data = useMemo(() => transactionTrendData(analytics), [analytics]);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-semibold text-foreground">Transactions (7 days)</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {analytics?.recentTransactionsCount != null
          ? `${analytics.recentTransactionsCount} in the last 7 days (API)`
          : "Estimated trend — daily breakdown pending API"}
      </p>
      <ChartContainer config={trendConfig} className="mt-4 h-[220px] w-full">
        <LineChart data={data} margin={{ left: 8, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey="count" stroke="var(--color-count)" strokeWidth={2} dot />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

export function RevenuePlaceholderChart({ analytics }: { analytics?: AdminAnalyticsDto }) {
  const data = useMemo(() => revenuePlaceholder(analytics), [analytics]);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-semibold text-foreground">Revenue placeholder</h3>
      <p className="mt-1 text-xs text-muted-foreground">DD revenue spread (demo projection)</p>
      <ChartContainer config={revenueConfig} className="mt-4 h-[220px] w-full">
        <BarChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export function QueueDepthChart({ analytics }: { analytics?: AdminAnalyticsDto }) {
  const data = useMemo(
    () => [
      { queue: "pendingKyc", label: "Pending KYC", count: analytics?.pendingKyc ?? 0 },
      {
        queue: "pendingVerifications",
        label: "Pending verifications",
        count: analytics?.pendingVerifications ?? 0,
      },
    ],
    [analytics],
  );
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-semibold text-foreground">Review queue depth</h3>
      <p className="mt-1 text-xs text-muted-foreground">Staff ops backlog</p>
      <ChartContainer config={queueConfig} className="mt-4 h-[220px] w-full">
        <BarChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" radius={4}>
            {data.map((entry) => (
              <Cell key={entry.queue} fill={`var(--color-${entry.queue})`} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
