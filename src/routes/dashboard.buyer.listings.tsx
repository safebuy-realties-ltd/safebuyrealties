import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { useListingsQuery } from "@/hooks/use-listings";
import { statusBadgeClass, statusIsPublic, statusLabel } from "@/lib/listing-status";

export const Route = createFileRoute("/dashboard/buyer/listings")({
  component: BrowseListings,
});

type Row = {
  id: string;
  title: string;
  location: string;
  price: string;
  priceValue: number;
  beds: number;
  baths: number;
  area: string;
  status: string;
};

function statusIcon(status: string) {
  if (statusIsPublic(status)) return ShieldCheck;
  if (status === "VERIFIED" || status === "IN_VERIFICATION" || status === "ASSIGNED") return Clock;
  return ShieldAlert;
}

function formatNgn(amount: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
}

function listingToRow(l: {
  id: string;
  title: string;
  location: string;
  price: string;
  status: string;
  beds?: number | null;
  baths?: number | null;
  landAreaSqm?: number | null;
}): Row {
  const priceValue = Number(l.price) || 0;
  return {
    id: l.id,
    title: l.title,
    location: l.location,
    price: formatNgn(l.price),
    priceValue,
    beds: l.beds ?? 0,
    baths: l.baths ?? 0,
    area: l.landAreaSqm ? `${l.landAreaSqm} m²` : "—",
    status: l.status,
  };
}

type SortKey = "title" | "location" | "priceValue" | "beds" | "status";
type SortDir = "asc" | "desc";

function BrowseListings() {
  const { data, isLoading, isError, error, refetch } = useListingsQuery();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | "all">("all");
  const [beds, setBeds] = useState<string>("any");
  const [sortKey, setSortKey] = useState<SortKey>("priceValue");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const baseRows = useMemo(
    () => (data?.listings ?? []).filter((l) => statusIsPublic(l.status)).map(listingToRow),
    [data?.listings],
  );

  const statusOptions = useMemo(() => {
    const set = new Set(baseRows.map((r) => r.status));
    return Array.from(set).sort();
  }, [baseRows]);

  const rows = useMemo(() => {
    const filtered = baseRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (beds !== "any" && r.beds < Number(beds)) return false;
      if (q && !`${r.title} ${r.location}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number")
        return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [baseRows, q, statusFilter, beds, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const SortHeader = ({
    k,
    children,
    className = "",
  }: {
    k: SortKey;
    children: React.ReactNode;
    className?: string;
  }) => {
    const Icon = sortKey !== k ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground ${className}`}
      >
        {children}
        <Icon className="h-3 w-3" />
      </button>
    );
  };

  return (
    <>
      <PageHeader
        title="Browse listings"
        description="Search verified properties and review verification status."
      />

      {isError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load listings."}{" "}
          <button type="button" className="ml-2 underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title or location…"
              className="h-10 pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <select
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="any">Any beds</option>
            <option value="2">2+ beds</option>
            <option value="3">3+ beds</option>
            <option value="4">4+ beds</option>
          </select>
          <Button
            variant="outline"
            onClick={() => {
              setQ("");
              setStatusFilter("all");
              setBeds("any");
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-12 gap-4 border-b border-border/60 bg-secondary/40 px-5 py-3 md:grid">
          <div className="col-span-4">
            <SortHeader k="title">Property</SortHeader>
          </div>
          <div className="col-span-3">
            <SortHeader k="location">Location</SortHeader>
          </div>
          <div className="col-span-2 text-right">
            <SortHeader k="priceValue" className="ml-auto">
              Price
            </SortHeader>
          </div>
          <div className="col-span-1 text-right">
            <SortHeader k="beds" className="ml-auto">
              Beds
            </SortHeader>
          </div>
          <div className="col-span-2">
            <SortHeader k="status">Status</SortHeader>
          </div>
        </div>
        <div className="divide-y divide-border/60">
          {isLoading && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Loading listings…
            </div>
          )}
          {!isLoading && rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No listings match your filters.
            </div>
          )}
          {!isLoading &&
            rows.map((r) => {
              const Icon = statusIcon(r.status);
              return (
                <Link
                  key={r.id}
                  to="/listings/$listingId"
                  params={{ listingId: r.id }}
                  className="grid grid-cols-1 gap-2 px-5 py-4 text-sm transition-colors hover:bg-secondary/40 md:grid-cols-12 md:items-center md:gap-4"
                >
                  <div className="col-span-4">
                    <p className="font-medium text-foreground">{r.title}</p>
                    <p className="text-xs text-muted-foreground md:hidden">{r.location}</p>
                  </div>
                  <div className="col-span-3 hidden text-muted-foreground md:block">
                    {r.location}
                  </div>
                  <div className="col-span-2 font-semibold text-primary md:text-right">
                    {r.price}
                  </div>
                  <div className="col-span-1 text-muted-foreground md:text-right">
                    {r.beds || "—"}
                  </div>
                  <div className="col-span-2">
                    <Badge variant="outline" className={`gap-1 ${statusBadgeClass(r.status)}`}>
                      <Icon className="h-3 w-3" /> {statusLabel(r.status)}
                    </Badge>
                  </div>
                </Link>
              );
            })}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Showing {rows.length} of {baseRows.length} listings
        {data?.meta?.total != null ? ` (${data.meta.total} on server)` : null}
      </p>
    </>
  );
}
