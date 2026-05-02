import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useListingsQuery } from "@/hooks/use-listings";

export const Route = createFileRoute("/dashboard/staff")({
  component: () => (
    <DashboardLayout role="staff">
      <StaffOverview />
    </DashboardLayout>
  ),
});

const PIPELINE = ["PENDING_REVIEW", "ASSIGNED", "IN_VERIFICATION"] as const;

function StaffOverview() {
  const { data, isLoading, isError, error, refetch } = useListingsQuery({ pageSize: 200 });
  const listings = data?.listings ?? [];

  const stats = useMemo(() => {
    const pipeline = listings.filter((l) => PIPELINE.includes(l.status as (typeof PIPELINE)[number]));
    const assigned = listings.filter((l) => l.status === "ASSIGNED").length;
    const inVer = listings.filter((l) => l.status === "IN_VERIFICATION").length;
    const pending = listings.filter((l) => l.status === "PENDING_REVIEW").length;
    return { pipeline: pipeline.length, pending, assigned, inVer, live: listings.filter((l) => l.status === "LIVE").length };
  }, [listings]);

  const recent = useMemo(
    () =>
      [...listings]
        .filter((l) => PIPELINE.includes(l.status as (typeof PIPELINE)[number]))
        .slice(0, 12),
    [listings],
  );

  return (
    <>
      <PageHeader
        title="Operations workspace"
        description="Listings in review and verification. Open Workflow to assign professionals to steps."
      />
      {isError && (
        <p className="mb-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load listings."}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="In pipeline" value={isLoading ? "…" : String(stats.pipeline)} hint="Review + verify" />
        <StatCard label="Pending review" value={isLoading ? "…" : String(stats.pending)} />
        <StatCard label="In verification" value={isLoading ? "…" : String(stats.inVer)} />
        <StatCard label="Live" value={isLoading ? "…" : String(stats.live)} hint="Published" />
      </div>

      <div className="mt-10 rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-5">
          <h2 className="text-lg font-semibold">Listings in review / verification</h2>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/staff/workflow">Open workflow</Link>
          </Button>
        </div>
        <div className="divide-y divide-border/60">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && recent.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">No listings in this pipeline right now.</p>
          )}
          {!isLoading &&
            recent.map((l) => (
              <div key={l.id} className="grid grid-cols-12 items-center gap-4 px-5 py-4 text-sm">
                <div className="col-span-4 font-medium text-foreground">{l.title}</div>
                <div className="col-span-3 text-muted-foreground">{l.sellerName ?? l.sellerId.slice(0, 8)}</div>
                <div className="col-span-3">
                  <Badge variant="outline">{l.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="col-span-2 text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/dashboard/staff/workflow" search={{ listing: l.id }}>
                      Assign
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
