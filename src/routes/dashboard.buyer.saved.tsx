import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { useSavedListingsQuery } from "@/hooks/use-saved-listings";
import { statusBadgeClass, statusLabel } from "@/lib/listing-status";
import { formatListingSpecSummary } from "@/lib/listing-spec";

export const Route = createFileRoute("/dashboard/buyer/saved")({
  component: SavedPropertiesPage,
});

function formatNgn(amount: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
}

function SavedPropertiesPage() {
  const { data, isLoading, isError } = useSavedListingsQuery(1, 50);
  const listings = data?.listings ?? [];

  return (
    <>
      <PageHeader
        title="Saved properties"
        description="Listings you have saved for later."
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading saved listings…</p>}
      {isError && (
        <p className="text-sm text-destructive">Could not load saved properties.</p>
      )}
      {!isLoading && !isError && listings.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No saved properties yet. Browse{" "}
          <Link to="/dashboard/buyer/listings" className="text-primary underline">
            listings
          </Link>{" "}
          and tap the heart icon to save.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {listings.map((l) => (
          <Link
            key={l.id}
            to="/listings/$listingId"
            params={{ listingId: l.id }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-[var(--shadow-card)] transition-colors hover:bg-secondary/30"
          >
            <div>
              <p className="font-medium">{l.title}</p>
              <p className="text-sm text-muted-foreground">{l.location}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatListingSpecSummary(l) || "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-primary">{formatNgn(l.price)}</p>
              <Badge variant="outline" className={`mt-2 ${statusBadgeClass(l.status)}`}>
                {statusLabel(l.status)}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
