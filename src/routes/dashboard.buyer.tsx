import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { ListingCard, sampleListings } from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/buyer")({
  component: () => (
    <DashboardLayout role="buyer">
      <BuyerOverview />
    </DashboardLayout>
  ),
});

function BuyerOverview() {
  return (
    <>
      <PageHeader
        title="Welcome back, Sam"
        description="Discover verified properties and track your transactions."
        actions={<Button>Browse listings</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Saved listings" value="12" hint="3 added this week" />
        <StatCard label="Active offers" value="2" hint="1 awaiting response" />
        <StatCard label="In escrow" value="$185,000" hint="Maple Heights Apartment" />
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Verified for you</h2>
          <Button variant="ghost" size="sm">View all</Button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sampleListings.slice(0, 3).map((l) => <ListingCard key={l.id} listing={l} />)}
        </div>
      </div>

      <div className="mt-10 rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Transaction status</h2>
        <div className="mt-4 divide-y divide-border/60">
          {[
            { name: "Maple Heights Apartment", stage: "Escrow funded", status: "in_progress" },
            { name: "Garden Court Residence", stage: "Offer submitted", status: "pending" },
            { name: "Sunset Bay Condo", stage: "Documents verified", status: "completed" },
          ].map((t, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-foreground">{t.name}</p>
                <p className="text-sm text-muted-foreground">{t.stage}</p>
              </div>
              <Badge variant="outline" className={
                t.status === "completed" ? "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]" :
                t.status === "in_progress" ? "border-primary/20 bg-primary-soft text-primary" :
                "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]"
              }>{t.status === "in_progress" ? "In progress" : t.status === "completed" ? "Completed" : "Pending"}</Badge>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
