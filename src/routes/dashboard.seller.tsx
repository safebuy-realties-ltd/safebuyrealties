import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus, Upload, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useCreateListingMutation, useListingsQuery, type ListingDto } from "@/hooks/use-listings";
import { useListingDocumentsQuery } from "@/hooks/use-documents";

export const Route = createFileRoute("/dashboard/seller")({
  component: () => (
    <DashboardLayout role="seller">
      <SellerOverview />
    </DashboardLayout>
  ),
});

function formatMoney(amount: string, currency: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
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

function listingStatusStyle(status: string) {
  switch (status) {
    case "LIVE":
      return "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]";
    case "VERIFIED":
      return "border-primary/20 bg-primary-soft text-primary";
    case "IN_VERIFICATION":
    case "ASSIGNED":
      return "border-primary/20 bg-primary-soft text-primary";
    case "PENDING_REVIEW":
      return "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]";
    case "REJECTED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "ARCHIVED":
      return "border-border text-muted-foreground";
    case "DRAFT":
    default:
      return "border-border text-muted-foreground";
  }
}

function listingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "Draft",
    PENDING_REVIEW: "Pending review",
    ASSIGNED: "Assigned",
    IN_VERIFICATION: "Verifying",
    VERIFIED: "Verified",
    LIVE: "Live",
    REJECTED: "Rejected",
    ARCHIVED: "Archived",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

function SellerOverview() {
  const { data, isLoading, isError, error, refetch } = useListingsQuery();
  const listings = data?.listings ?? [];

  const firstListingId = listings[0]?.id ?? null;
  const { data: previewDocs } = useListingDocumentsQuery(firstListingId);

  const stats = useMemo(() => {
    const live = listings.filter((l) => l.status === "LIVE").length;
    const inVerification = listings.filter((l) =>
      ["PENDING_REVIEW", "ASSIGNED", "IN_VERIFICATION", "VERIFIED"].includes(l.status),
    ).length;
    return { total: listings.length, live, inVerification };
  }, [listings]);

  const recentListings = useMemo(() => [...listings].slice(0, 8), [listings]);

  const createListing = useCreateListingMutation();
  const [title, setTitle] = useState("");

  const createDraft = () => {
    const clean = title.trim();
    if (!clean) return;
    createListing.mutate(
      {
        title: clean,
        description: `${clean} description`,
        location: "Lagos",
        price: 0,
        currency: "NGN",
      },
      {
        onSuccess: () => {
          setTitle("");
          toast.success("Draft listing created.");
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not create listing."),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Seller dashboard"
        description="Create listings, manage documents and track verification."
        actions={
          <Button type="button" asChild>
            <Link to="/dashboard/seller/listings">
              <Plus className="mr-1 h-4 w-4" /> New listing
            </Link>
          </Button>
        }
      />

      {isError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load listings."}{" "}
          <button type="button" className="ml-2 underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium">Create listing draft</p>
        <div className="mt-2 flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Listing title" />
          <Button type="button" onClick={createDraft} disabled={createListing.isPending || !title.trim()}>
            {createListing.isPending ? "Creating…" : "Create draft"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Your listings" value={String(stats.total)} hint={`${stats.live} live`} />
        <StatCard label="In verification" value={String(stats.inVerification)} hint="Pipeline stages" />
        <StatCard label="Documents (first listing)" value={String(previewDocs?.length ?? 0)} hint="Upload more in Documents" />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)] lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Your listings</h2>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/seller/listings">Manage listings</Link>
            </Button>
          </div>
          <div className="mt-4 divide-y divide-border/60">
            {isLoading && (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading listings…</p>
            )}
            {!isLoading && recentListings.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No listings yet.</p>
            )}
            {!isLoading &&
              recentListings.map((l) => (
                <ListingRow key={l.id} listing={l} />
              ))}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-semibold">Documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">Latest uploads for your first listing.</p>
          <div className="mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/40 p-6 text-center">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Upload in Documents</p>
            <Button className="mt-3" variant="secondary" size="sm" asChild>
              <Link to="/dashboard/seller/documents">Open documents</Link>
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {(previewDocs ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No documents yet for the first listing.</p>
            )}
            {(previewDocs ?? []).slice(0, 4).map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{d.fileName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function ListingRow({ listing }: { listing: ListingDto }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <Link to="/listings/$listingId" params={{ listingId: listing.id }} className="font-medium text-foreground hover:underline">
          {listing.title}
        </Link>
        <p className="text-sm text-muted-foreground">
          {formatMoney(listing.price, listing.currency)} · {listing.location}
        </p>
      </div>
      <Badge variant="outline" className={listingStatusStyle(listing.status)}>
        {listingStatusLabel(listing.status)}
      </Badge>
    </div>
  );
}
