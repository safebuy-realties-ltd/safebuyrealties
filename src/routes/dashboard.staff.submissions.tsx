import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { useListingsQuery } from "@/hooks/use-listings";

export const Route = createFileRoute("/dashboard/staff/submissions")({
  component: () => (
    <DashboardLayout role="staff">
      <StaffSubmissions />
    </DashboardLayout>
  ),
});

const PIPELINE = ["PENDING_REVIEW", "ASSIGNED", "IN_VERIFICATION", "VERIFIED"] as const;

function StaffSubmissions() {
  const { data, isLoading, isError, error, refetch } = useListingsQuery({ pageSize: 200 });
  const listings = data?.listings ?? [];
  const [q, setQ] = useState("");

  const pipeline = useMemo(
    () => listings.filter((l) => PIPELINE.includes(l.status as (typeof PIPELINE)[number])),
    [listings],
  );

  const visible = useMemo(() => {
    if (!q.trim()) return pipeline;
    const n = q.toLowerCase();
    return pipeline.filter(
      (l) =>
        l.title.toLowerCase().includes(n) ||
        l.location.toLowerCase().includes(n) ||
        (l.sellerName ?? "").toLowerCase().includes(n) ||
        l.status.toLowerCase().includes(n),
    );
  }, [pipeline, q]);

  const counts = {
    all: pipeline.length,
    pending: pipeline.filter((l) => l.status === "PENDING_REVIEW").length,
    in_progress: pipeline.filter((l) => l.status === "ASSIGNED" || l.status === "IN_VERIFICATION").length,
    completed: pipeline.filter((l) => l.status === "VERIFIED").length,
  };

  return (
    <>
      <PageHeader
        title="Submissions"
        description="Listings moving through verification. Assign professionals in Workflow."
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
        <StatCard label="All" value={isLoading ? "…" : String(counts.all)} />
        <StatCard label="Pending review" value={isLoading ? "…" : String(counts.pending)} />
        <StatCard label="Verifying" value={isLoading ? "…" : String(counts.in_progress)} />
        <StatCard label="Verified" value={isLoading ? "…" : String(counts.completed)} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative ml-auto min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-10 pl-9" />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-12 gap-4 border-b border-border/60 bg-secondary/40 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div className="col-span-4">Listing</div>
          <div className="col-span-3">Seller</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3 text-right">Actions</div>
        </div>
        <ul className="divide-y divide-border/60">
          {isLoading && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</li>
          )}
          {!isLoading && visible.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">No listings match.</li>
          )}
          {!isLoading &&
            visible.map((l) => (
              <li key={l.id} className="grid grid-cols-1 gap-2 px-5 py-4 text-sm md:grid-cols-12 md:items-center md:gap-4">
                <div className="col-span-4 font-medium text-foreground">{l.title}</div>
                <div className="col-span-3 text-muted-foreground">{l.sellerName ?? l.sellerId}</div>
                <div className="col-span-2">
                  <Badge variant="outline">{l.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="col-span-3 flex justify-end">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/dashboard/staff/workflow" search={{ listing: l.id }}>
                      Assign in workflow
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}
