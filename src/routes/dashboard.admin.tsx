import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/admin")({
  component: () => (
    <DashboardLayout role="admin">
      <AdminOverview />
    </DashboardLayout>
  ),
});

function AdminOverview() {
  return (
    <>
      <PageHeader
        title="Platform overview"
        description="System health, users and listings at a glance."
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total users" value="12,480" hint="+312 this month" />
        <StatCard label="Active listings" value="3,217" />
        <StatCard label="Pending reviews" value="42" />
        <StatCard label="Revenue (MTD)" value="$184k" hint="+8.2%" />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-semibold">Recent users</h2>
          <div className="mt-4 space-y-3">
            {[
              { name: "Adaeze Okeke", role: "Buyer", initials: "AO" },
              { name: "Tunde Kalu", role: "Seller", initials: "TK" },
              { name: "Maya Idris", role: "Professional", initials: "MI" },
              { name: "Olu Adebayo", role: "Buyer", initials: "OA" },
            ].map((u) => (
              <div key={u.name} className="flex items-center gap-3">
                <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary-soft text-primary text-xs">{u.initials}</AvatarFallback></Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.role}</p>
                </div>
                <Badge variant="outline" className="border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]">Active</Badge>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-semibold">System status</h2>
          <div className="mt-4 space-y-3">
            {[
              { name: "Verification engine", up: true },
              { name: "Payment & escrow", up: true },
              { name: "Document storage", up: true },
              { name: "Notification service", up: true },
            ].map((s) => (
              <div key={s.name} className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-4 py-3">
                <span className="text-sm font-medium">{s.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-success" /> Operational
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
