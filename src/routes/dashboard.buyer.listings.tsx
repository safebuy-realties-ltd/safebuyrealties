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
  X,
} from "lucide-react";
import { useListingsQuery, type ListingsQueryOptions } from "@/hooks/use-listings";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { statusBadgeClass, statusIsPublic, statusLabel } from "@/lib/listing-status";
import { formatBuildType } from "@/lib/listing-spec";

export const Route = createFileRoute("/dashboard/buyer/listings")({
  component: BrowseListings,
});

type ListingFilters = {
  location: string;
  minPrice: string;
  maxPrice: string;
  buildType: string;
  minBeds: string;
  status: string;
};

const EMPTY_FILTERS: ListingFilters = {
  location: "",
  minPrice: "",
  maxPrice: "",
  buildType: "",
  minBeds: "",
  status: "",
};

const STATUS_OPTIONS = ["LIVE", "UNDER_OFFER", "SOLD"] as const;

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

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalInt(raw: string): number | undefined {
  const n = parseOptionalNumber(raw);
  if (n == null) return undefined;
  return Number.isInteger(n) ? n : Math.trunc(n);
}

function filtersToQuery(filters: ListingFilters): ListingsQueryOptions {
  const query: ListingsQueryOptions = {};
  const location = filters.location.trim();
  if (location) query.location = location;

  const minPrice = parseOptionalNumber(filters.minPrice);
  if (minPrice != null) query.minPrice = minPrice;

  const maxPrice = parseOptionalNumber(filters.maxPrice);
  if (maxPrice != null) query.maxPrice = maxPrice;

  const buildType = filters.buildType.trim();
  if (buildType) query.buildType = buildType;

  const minBeds = parseOptionalInt(filters.minBeds);
  if (minBeds != null) query.minBeds = minBeds;

  if (filters.status) query.status = filters.status;

  return query;
}

type SortKey = "title" | "location" | "priceValue" | "beds" | "status";
type SortDir = "asc" | "desc";

function BrowseListings() {
  const [filters, setFilters] = useState<ListingFilters>(EMPTY_FILTERS);
  const debouncedFilters = useDebouncedValue(filters, 300);
  const queryOptions = useMemo(() => filtersToQuery(debouncedFilters), [debouncedFilters]);
  const { data, isLoading, isFetching, isError, error, refetch } = useListingsQuery(queryOptions);
  const [sortKey, setSortKey] = useState<SortKey>("priceValue");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const baseRows = useMemo(() => (data?.listings ?? []).map(listingToRow), [data?.listings]);

  const rows = useMemo(() => {
    const sorted = [...baseRows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number")
        return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [baseRows, sortKey, sortDir]);

  const activeChips = useMemo(() => {
    const chips: { key: keyof ListingFilters; label: string }[] = [];
    const location = filters.location.trim();
    if (location) chips.push({ key: "location", label: `Location: ${location}` });

    const minPrice = parseOptionalNumber(filters.minPrice);
    if (minPrice != null)
      chips.push({ key: "minPrice", label: `Min price: ${formatNgn(String(minPrice))}` });

    const maxPrice = parseOptionalNumber(filters.maxPrice);
    if (maxPrice != null)
      chips.push({ key: "maxPrice", label: `Max price: ${formatNgn(String(maxPrice))}` });

    const buildType = filters.buildType.trim();
    if (buildType) {
      chips.push({
        key: "buildType",
        label: `Build type: ${formatBuildType(buildType) ?? buildType}`,
      });
    }

    const minBeds = parseOptionalInt(filters.minBeds);
    if (minBeds != null) chips.push({ key: "minBeds", label: `${minBeds}+ beds` });

    if (filters.status)
      chips.push({ key: "status", label: `Status: ${statusLabel(filters.status)}` });

    return chips;
  }, [filters]);

  const clearFilter = (key: keyof ListingFilters) => {
    setFilters((prev) => ({ ...prev, [key]: "" }));
  };

  const resetFilters = () => setFilters(EMPTY_FILTERS);

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.location}
              onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
              placeholder="Location…"
              className="h-10 pl-9"
            />
          </div>
          <Input
            type="number"
            min="0"
            value={filters.minPrice}
            onChange={(e) => setFilters((prev) => ({ ...prev, minPrice: e.target.value }))}
            placeholder="Min price (NGN)"
            className="h-10"
          />
          <Input
            type="number"
            min="0"
            value={filters.maxPrice}
            onChange={(e) => setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))}
            placeholder="Max price (NGN)"
            className="h-10"
          />
          <Input
            value={filters.buildType}
            onChange={(e) => setFilters((prev) => ({ ...prev, buildType: e.target.value }))}
            placeholder="Build type"
            className="h-10"
          />
          <select
            value={filters.minBeds}
            onChange={(e) => setFilters((prev) => ({ ...prev, minBeds: e.target.value }))}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Any beds</option>
            <option value="2">2+ beds</option>
            <option value="3">3+ beds</option>
            <option value="4">4+ beds</option>
            <option value="5">5+ beds</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Live listings</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        {(activeChips.length > 0 || isFetching) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => (
              <Badge key={chip.key} variant="secondary" className="gap-1 pr-1 font-normal">
                {chip.label}
                <button
                  type="button"
                  aria-label={`Remove ${chip.label}`}
                  onClick={() => clearFilter(chip.key)}
                  className="rounded-sm p-0.5 hover:bg-background/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {activeChips.length > 0 && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear all
              </Button>
            )}
            {isFetching && !isLoading && (
              <span className="text-xs text-muted-foreground">Updating…</span>
            )}
          </div>
        )}
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
        Showing {rows.length} listing{rows.length === 1 ? "" : "s"}
        {data?.meta?.total != null ? ` (${data.meta.total} matching on server)` : null}
      </p>
    </>
  );
}
