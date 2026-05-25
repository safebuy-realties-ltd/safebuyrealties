import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useListingsQuery, type ListingDto } from "@/hooks/use-listings";
import { useUpdateListingMutation } from "@/hooks/use-update-listing";
import { ApiError } from "@/lib/api";
import { statusBadgeClass, statusLabel } from "@/lib/listing-status";

export const Route = createFileRoute("/dashboard/admin/listings")({
  component: () => (
    <DashboardLayout role="admin">
      <AdminListings />
    </DashboardLayout>
  ),
});

function formatMoney(amount: string, currency: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${currency} ${amount}`;
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${amount}`;
  }
}

function AdminListings() {
  const { data, isLoading, isError, error, refetch } = useListingsQuery({ pageSize: 150 });
  const listings = useMemo(() => data?.listings ?? [], [data?.listings]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | "all">("all");
  const update = useUpdateListingMutation();

  const visible = useMemo(() => {
    let rows = listings;
    if (statusFilter !== "all") rows = rows.filter((l) => l.status === statusFilter);
    if (!q.trim()) return rows;
    const n = q.toLowerCase();
    return rows.filter(
      (l) =>
        l.title.toLowerCase().includes(n) ||
        l.location.toLowerCase().includes(n) ||
        (l.sellerName ?? "").toLowerCase().includes(n) ||
        l.status.toLowerCase().includes(n),
    );
  }, [listings, statusFilter, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: listings.length };
    for (const l of listings) {
      c[l.status] = (c[l.status] ?? 0) + 1;
    }
    return c;
  }, [listings]);

  const setStatus = (l: ListingDto, status: string) => {
    update.mutate(
      { id: l.id, body: { status } },
      {
        onSuccess: () => toast.success(`Listing → ${status}`),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Update failed."),
      },
    );
  };

  const statuses = [
    "DRAFT",
    "PENDING_REVIEW",
    "ASSIGNED",
    "IN_VERIFICATION",
    "VERIFIED",
    "LIVE",
    "REJECTED",
    "ARCHIVED",
  ];

  return (
    <>
      <PageHeader
        title="Listings overview"
        description="All listings (admin). Update status for demos."
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
        <StatCard label="Total" value={isLoading ? "…" : String(counts.all)} />
        <StatCard label="Live" value={isLoading ? "…" : String(counts.LIVE ?? 0)} />
        <StatCard
          label="In review"
          value={
            isLoading ? "…" : String((counts.PENDING_REVIEW ?? 0) + (counts.IN_VERIFICATION ?? 0))
          }
        />
        <StatCard label="Draft" value={isLoading ? "…" : String(counts.DRAFT ?? 0)} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="inline-flex max-w-full flex-wrap rounded-lg border border-border/60 bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-md px-2 py-1.5 text-xs ${statusFilter === "all" ? "bg-primary text-primary-foreground" : ""}`}
          >
            All ({counts.all})
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-2 py-1.5 text-xs ${statusFilter === s ? "bg-primary text-primary-foreground" : ""}`}
            >
              {statusLabel(s)} ({counts[s] ?? 0})
            </button>
          ))}
        </div>
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
        <div className="hidden grid-cols-12 gap-4 border-b border-border/60 bg-secondary/40 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
          <div className="col-span-3">Listing</div>
          <div className="col-span-2">Seller</div>
          <div className="col-span-2">Location</div>
          <div className="col-span-2">Price</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2 text-right">Quick set</div>
        </div>
        <ul className="divide-y divide-border/60">
          {isLoading && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</li>
          )}
          {!isLoading && visible.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">No listings.</li>
          )}
          {!isLoading &&
            visible.map((l) => (
              <li
                key={l.id}
                className="grid grid-cols-1 gap-2 px-5 py-4 text-sm lg:grid-cols-12 lg:items-center lg:gap-4"
              >
                <div className="col-span-3 font-medium text-foreground">{l.title}</div>
                <div className="col-span-2 text-muted-foreground">
                  {l.sellerName ?? l.sellerId.slice(0, 8)}
                </div>
                <div className="col-span-2 text-muted-foreground">{l.location}</div>
                <div className="col-span-2 text-foreground">{formatMoney(l.price, l.currency)}</div>
                <div className="col-span-1">
                  <Badge variant="outline" className={statusBadgeClass(l.status)}>
                    {statusLabel(l.status)}
                  </Badge>
                </div>
                <div className="col-span-2 flex flex-wrap justify-end gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={update.isPending}
                    onClick={() => setStatus(l, "PENDING_REVIEW")}
                  >
                    Review
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={update.isPending}
                    onClick={() => setStatus(l, "LIVE")}
                  >
                    Live
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={update.isPending}
                    onClick={() => setStatus(l, "REJECTED")}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}
