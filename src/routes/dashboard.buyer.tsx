import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { ListingCard, type Listing } from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { statusIsPublic } from "@/lib/listing-status";
import { useListingsQuery, type ListingDto } from "@/hooks/use-listings";
import { useMyTransactionsQuery } from "@/hooks/use-transactions";

const PLACEHOLDER_IMG = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80";

export const Route = createFileRoute("/dashboard/buyer")({
  component: () => (
    <DashboardLayout role="buyer">
      <BuyerOverview />
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

function toListingCard(l: ListingDto): Listing {
  return {
    id: l.id,
    title: l.title,
    location: l.location,
    price: formatMoney(l.price, l.currency),
    beds: 0,
    baths: 0,
    area: "—",
    status: l.status,
    verified: statusIsPublic(l.status),
    image: PLACEHOLDER_IMG,
  };
}

function txBadgeClass(status: string) {
  if (status === "COMPLETED") return "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]";
  if (status === "IN_PROGRESS") return "border-primary/20 bg-primary-soft text-primary";
  return "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]";
}

function BuyerOverview() {
  const { user } = useAuth();
  const { data: listingsData, isLoading: loadListings } = useListingsQuery();
  const listings = useMemo(() => listingsData?.listings ?? [], [listingsData?.listings]);
  const { data: txs, isLoading: loadTxs } = useMyTransactionsQuery();

  const previewListings = useMemo(
    () =>
      listings
        .filter((l) => statusIsPublic(l.status))
        .slice(0, 6)
        .map(toListingCard),
    [listings],
  );
  const previewTxs = useMemo(() => (txs ?? []).slice(0, 5), [txs]);

  const stats = useMemo(() => {
    const t = txs ?? [];
    return {
      listings: listings.length,
      activeTx: t.filter((x) => x.status !== "COMPLETED").length,
      doneTx: t.filter((x) => x.status === "COMPLETED").length,
    };
  }, [listings.length, txs]);

  return (
    <>
      <PageHeader
        title={user?.name ? `Welcome back, ${user.name.split(" ")[0]}` : "Buyer dashboard"}
        description="Browse live listings and track your transactions."
        actions={
          <Button asChild>
            <Link to="/dashboard/buyer/listings">Browse listings</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Live listings"
          value={loadListings ? "…" : String(stats.listings)}
          hint="Browse"
        />
        <StatCard label="Active transactions" value={loadTxs ? "…" : String(stats.activeTx)} />
        <StatCard label="Completed" value={loadTxs ? "…" : String(stats.doneTx)} />
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Live listings</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard/buyer/listings">View all</Link>
          </Button>
        </div>
        {loadListings && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loadListings && previewListings.length === 0 && (
          <p className="text-sm text-muted-foreground">No listings available.</p>
        )}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {previewListings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      </div>

      <div className="mt-10 rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent transactions</h2>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/buyer/transactions">Open</Link>
          </Button>
        </div>
        {loadTxs && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loadTxs && previewTxs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No transactions yet. Start one from a listing.
          </p>
        )}
        <div className="mt-4 divide-y divide-border/60">
          {previewTxs.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-foreground">{t.listing.title}</p>
                <p className="text-sm text-muted-foreground">{t.listing.location}</p>
              </div>
              <Badge variant="outline" className={txBadgeClass(t.status)}>
                {t.status.replace(/_/g, " ")}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
