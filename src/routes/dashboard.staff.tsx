import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/staff")({
  component: () => (
    <DashboardLayout role="staff">
      <StaffOverview />
    </DashboardLayout>
  ),
});

function StaffOverview() {
  return (
    <>
      <PageHeader
        title="Operations workspace"
        description="Review submissions, assign professionals, manage workflow."
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="New submissions" value="8" />
        <StatCard label="Awaiting assignment" value="5" />
        <StatCard label="Active verifications" value="14" />
        <StatCard label="Closed this week" value="11" />
      </div>

      <div className="mt-10 rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-border/60 p-5">
          <h2 className="text-lg font-semibold">Recent submissions</h2>
          <Button variant="outline" size="sm">Export</Button>
        </div>
        <div className="divide-y divide-border/60">
          {[
            { listing: "Acacia Hills Estate", seller: "Olu A.", type: "Survey", status: "pending" },
            { listing: "Riverside Townhouse", seller: "Maya I.", type: "Legal", status: "in_progress" },
            { listing: "Garden Court Residence", seller: "Tunde K.", type: "Valuation", status: "in_progress" },
            { listing: "Maple Heights", seller: "Adaeze O.", type: "Inspection", status: "completed" },
          ].map((s, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-4 px-5 py-4 text-sm">
              <div className="col-span-4 font-medium text-foreground">{s.listing}</div>
              <div className="col-span-3 text-muted-foreground">{s.seller}</div>
              <div className="col-span-2 text-muted-foreground">{s.type}</div>
              <div className="col-span-2">
                <Badge variant="outline" className={
                  s.status === "completed" ? "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]" :
                  s.status === "in_progress" ? "border-primary/20 bg-primary-soft text-primary" :
                  "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]"
                }>{s.status === "in_progress" ? "In progress" : s.status === "completed" ? "Done" : "Pending"}</Badge>
              </div>
              <div className="col-span-1 text-right">
                <Button variant="ghost" size="sm">Assign</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
