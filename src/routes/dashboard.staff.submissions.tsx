import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useStaffQueueQuery, type StaffQueueFilter } from "@/hooks/use-staff-queue";
import { useUpdateListingMutation } from "@/hooks/use-update-listing";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/staff/submissions")({
  component: () => (
    <DashboardLayout role="staff">
      <StaffSubmissions />
    </DashboardLayout>
  ),
});

function StaffSubmissions() {
  const [filter, setFilter] = useState<"all" | StaffQueueFilter>("all");
  const { data, isLoading, isError, error, refetch } = useStaffQueueQuery(filter);
  const rows = data?.tableRows ?? [];
  const [q, setQ] = useState("");
  const updateListing = useUpdateListingMutation();

  const visible = useMemo(() => {
    if (!q.trim()) return rows;
    const n = q.toLowerCase();
    return rows.filter(
      (l) =>
        l.title.toLowerCase().includes(n) ||
        l.location.toLowerCase().includes(n) ||
        l.seller.toLowerCase().includes(n) ||
        l.backendStatus.toLowerCase().includes(n),
    );
  }, [rows, q]);

  const counts = data?.counts ?? { pending: 0, in_progress: 0, completed: 0, rejected: 0 };

  const approve = (listingId: string, status: string) => {
    const nextStatus =
      status === "ASSIGNED"
        ? "IN_VERIFICATION"
        : status === "IN_VERIFICATION"
          ? "VERIFIED"
          : "LIVE";
    updateListing.mutate(
      { id: listingId, body: { status: nextStatus } },
      {
        onSuccess: () => {
          toast.success(`Listing transitioned to ${nextStatus}.`);
          void refetch();
        },
        onError: (e) => {
          const msg = e instanceof ApiError ? e.message : "Update failed.";
          toast.error(msg);
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Submissions"
        description="Listings moving through verification with live backend status updates."
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
        <StatCard
          label="All"
          value={
            isLoading
              ? "…"
              : String(counts.pending + counts.in_progress + counts.completed + counts.rejected)
          }
        />
        <StatCard label="Pending" value={isLoading ? "…" : String(counts.pending)} />
        <StatCard label="In progress" value={isLoading ? "…" : String(counts.in_progress)} />
        <StatCard label="Completed" value={isLoading ? "…" : String(counts.completed)} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {["all", "pending", "in_progress", "completed", "rejected"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f as "all" | StaffQueueFilter)}
          >
            {f.replace("_", " ")}
          </Button>
        ))}
        <div className="relative ml-auto min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-10 pl-9"
          />
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
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">
              No listings match.
            </li>
          )}
          {!isLoading &&
            visible.map((l) => (
              <li
                key={l.id}
                className="grid grid-cols-1 gap-2 px-5 py-4 text-sm md:grid-cols-12 md:items-center md:gap-4"
              >
                <div className="col-span-4 font-medium text-foreground">{l.title}</div>
                <div className="col-span-3 text-muted-foreground">{l.seller}</div>
                <div className="col-span-2">
                  <Badge variant="outline">{l.backendStatus.replace(/_/g, " ")}</Badge>
                </div>
                <div className="col-span-3 flex justify-end gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/dashboard/staff/workflow" search={{ listing: l.id }}>
                      Assign in workflow
                    </Link>
                  </Button>
                  {["ASSIGNED", "IN_VERIFICATION", "VERIFIED"].includes(l.status) && (
                    <Button
                      size="sm"
                      disabled={updateListing.isPending}
                      onClick={() => approve(l.id, l.status)}
                    >
                      {l.status === "VERIFIED" ? "Publish live" : "Approve"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}
