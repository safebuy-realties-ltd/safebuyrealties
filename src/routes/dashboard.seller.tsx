import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus, Upload, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/seller")({
  component: () => (
    <DashboardLayout role="seller">
      <SellerOverview />
    </DashboardLayout>
  ),
});

function SellerOverview() {
  return (
    <>
      <PageHeader
        title="Seller dashboard"
        description="Create listings, manage documents and track verification."
        actions={<Button><Plus className="mr-1 h-4 w-4" /> New listing</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active listings" value="4" hint="2 verified" />
        <StatCard label="Pending verification" value="1" hint="Avg. 3 days" />
        <StatCard label="Total inquiries" value="38" hint="+12 this week" />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)] lg:col-span-2">
          <h2 className="text-lg font-semibold">Your listings</h2>
          <div className="mt-4 divide-y divide-border/60">
            {[
              { name: "Garden Court Residence", price: "$420,000", status: "verified" },
              { name: "Acacia Hills Estate", price: "$210,000", status: "pending" },
              { name: "Riverside Townhouse", price: "$295,000", status: "in_progress" },
            ].map((l) => (
              <div key={l.name} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-foreground">{l.name}</p>
                  <p className="text-sm text-muted-foreground">{l.price}</p>
                </div>
                <Badge variant="outline" className={
                  l.status === "verified" ? "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]" :
                  l.status === "in_progress" ? "border-primary/20 bg-primary-soft text-primary" :
                  "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]"
                }>{l.status === "verified" ? "Verified" : l.status === "in_progress" ? "Verifying" : "Pending"}</Badge>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-semibold">Documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">Upload title deeds and surveys.</p>
          <div className="mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/40 p-8 text-center">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Drop files or browse</p>
            <p className="text-xs text-muted-foreground">PDF, JPG up to 25MB</p>
          </div>
          <div className="mt-4 space-y-2">
            {["Title deed.pdf", "Survey plan.pdf"].map((f) => (
              <div key={f} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-primary" /> {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
