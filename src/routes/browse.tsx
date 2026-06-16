import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ListingCard } from "@/components/ListingCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePublicListingsQuery, type ListingsQueryOptions } from "@/hooks/use-listings";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listingDtoToCard } from "@/lib/listing-card-map";

export const Route = createFileRoute("/browse")({
  component: BrowsePage,
});

type ListingFilters = {
  location: string;
  minPrice: string;
  maxPrice: string;
  minBeds: string;
};

const EMPTY_FILTERS: ListingFilters = {
  location: "",
  minPrice: "",
  maxPrice: "",
  minBeds: "",
};

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

function formatNgn(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function filtersToQuery(filters: ListingFilters): ListingsQueryOptions {
  const query: ListingsQueryOptions = { pageSize: 24 };
  const location = filters.location.trim();
  if (location) query.location = location;

  const minPrice = parseOptionalNumber(filters.minPrice);
  if (minPrice != null) query.minPrice = minPrice;

  const maxPrice = parseOptionalNumber(filters.maxPrice);
  if (maxPrice != null) query.maxPrice = maxPrice;

  const minBeds = parseOptionalInt(filters.minBeds);
  if (minBeds != null) query.minBeds = minBeds;

  return query;
}

function BrowsePage() {
  const [filters, setFilters] = useState<ListingFilters>(EMPTY_FILTERS);
  const debouncedFilters = useDebouncedValue(filters, 300);
  const queryOptions = useMemo(() => filtersToQuery(debouncedFilters), [debouncedFilters]);
  const { data, isLoading, isFetching, isError, error, refetch } =
    usePublicListingsQuery(queryOptions);

  const cards = useMemo(
    () => (data?.listings ?? []).map(listingDtoToCard),
    [data?.listings],
  );

  const activeChips = useMemo(() => {
    const chips: { key: keyof ListingFilters; label: string }[] = [];
    const location = filters.location.trim();
    if (location) chips.push({ key: "location", label: `Location: ${location}` });

    const minPrice = parseOptionalNumber(filters.minPrice);
    if (minPrice != null) chips.push({ key: "minPrice", label: `Min: ${formatNgn(minPrice)}` });

    const maxPrice = parseOptionalNumber(filters.maxPrice);
    if (maxPrice != null) chips.push({ key: "maxPrice", label: `Max: ${formatNgn(maxPrice)}` });

    const minBeds = parseOptionalInt(filters.minBeds);
    if (minBeds != null) chips.push({ key: "minBeds", label: `${minBeds}+ beds` });

    return chips;
  }, [filters]);

  const clearFilter = (key: keyof ListingFilters) => {
    setFilters((prev) => ({ ...prev, [key]: "" }));
  };

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-border/60 bg-[var(--gradient-subtle)]">
          <div className="mx-auto max-w-7xl px-6 py-14 md:py-16">
            <p className="text-sm font-medium text-primary">Public marketplace</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Browse verified properties
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Explore live listings with title checks, survey validation, and escrow-ready
              transactions — no account required to start browsing.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-6 py-10">
          {isError && (
            <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load listings."}{" "}
              <button type="button" className="ml-2 underline" onClick={() => void refetch()}>
                Retry
              </button>
            </div>
          )}

          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative sm:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filters.location}
                  onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
                  placeholder="Location (e.g. Lekki, Abuja)"
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
              <select
                value={filters.minBeds}
                onChange={(e) => setFilters((prev) => ({ ...prev, minBeds: e.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:col-span-2 lg:col-span-1"
              >
                <option value="">Any beds</option>
                <option value="1">1+ beds</option>
                <option value="2">2+ beds</option>
                <option value="3">3+ beds</option>
                <option value="4">4+ beds</option>
                <option value="5">5+ beds</option>
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

          {isLoading ? (
            <div className="mt-10 text-center text-sm text-muted-foreground">Loading listings…</div>
          ) : cards.length === 0 ? (
            <div className="mt-10 rounded-xl border border-border/60 bg-card px-6 py-16 text-center shadow-[var(--shadow-card)]">
              <p className="text-sm font-medium text-foreground">No properties match your filters</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try broadening your search or{" "}
                <button type="button" className="text-primary underline" onClick={resetFilters}>
                  clear filters
                </button>
                .
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Showing {cards.length} live listing{cards.length === 1 ? "" : "s"}
            {data?.meta?.total != null ? ` (${data.meta.total} matching on server)` : null}
          </p>

          <div className="mt-10 rounded-2xl border border-border/60 bg-secondary/40 px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              View property details and start due diligence — no account required.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="outline">
                <Link to="/register" search={{ redirect: "/browse" }}>
                  Create account to save favorites
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
