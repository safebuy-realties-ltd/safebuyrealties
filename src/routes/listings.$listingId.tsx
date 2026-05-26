import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, MapPin, FileText, CheckCircle2, PlayCircle } from "lucide-react";
import { VerificationTracker, type VerificationStep } from "@/components/VerificationTracker";
import { toast } from "sonner";
import { useListingQuery } from "@/hooks/use-listings";
import { useAuth } from "@/lib/auth";
import { useCreateTransactionMutation } from "@/hooks/use-transactions";
import { API_BASE_URL, ApiError, apiRequest } from "@/lib/api";
import { useListingDocumentsQuery } from "@/hooks/use-documents";
import { useVerificationListingQuery, type VerificationStepDto } from "@/hooks/use-verification";
import type { ListingDto } from "@/hooks/use-listings";
import { formatListingSpecSummary } from "@/lib/listing-spec";

const PLACEHOLDER_IMG = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80";

function uploadAssetUrl(storageKey: string): string {
  const origin = API_BASE_URL.replace(/\/api\/v\d+\/?$/, "");
  return `${origin}/uploads/${storageKey}`;
}

export const Route = createFileRoute("/listings/$listingId")({
  loader: async ({ params }) => {
    const listing = await apiRequest<ListingDto>(`/listings/${params.listingId}`);
    return listing.data;
  },
  component: ListingDetail,
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

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mapVerificationSteps(steps: VerificationStepDto[]): VerificationStep[] {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const firstIncomplete = sorted.findIndex((s) => s.status !== "COMPLETED");
  return sorted.map((s, i) => {
    if (s.status === "COMPLETED") {
      return {
        label: s.label,
        status: "completed" as const,
        timestamp: s.completedAt ? new Date(s.completedAt).toLocaleString() : "Completed",
      };
    }
    if (i === firstIncomplete) {
      return {
        label: s.label,
        status: "current" as const,
        timestamp:
          s.status === "IN_PROGRESS"
            ? "In progress"
            : s.status === "BLOCKED"
              ? "Blocked"
              : "Pending",
      };
    }
    return { label: s.label, status: "pending" as const };
  });
}

function ListingDetail() {
  const { listingId } = Route.useParams();
  const loaderListing = Route.useLoaderData();
  const navigate = useNavigate();
  const { user, isAuthenticated, isReady } = useAuth();
  const {
    data: listing,
    isLoading,
    isError,
    error,
    refetch,
  } = useListingQuery(listingId, loaderListing);
  const createTransaction = useCreateTransactionMutation();
  const [isRoutingToVerification, setIsRoutingToVerification] = useState(false);

  const canFetchExtras = isReady && isAuthenticated && !!listingId;
  const { data: documents, isLoading: docsLoading } = useListingDocumentsQuery(
    canFetchExtras ? listingId : null,
  );
  const {
    data: verSteps,
    isLoading: verLoading,
    isError: verError,
  } = useVerificationListingQuery(listingId, canFetchExtras);

  const isBuyer = isAuthenticated && user?.role === "buyer";
  const resolvedListing = listing ?? loaderListing;
  const canStartTransaction = isBuyer && resolvedListing?.status === "LIVE";

  const trackerSteps = useMemo((): VerificationStep[] | null => {
    if (!verSteps?.length) return null;
    return mapVerificationSteps(verSteps);
  }, [verSteps]);

  const openVerificationStatus = () => {
    setIsRoutingToVerification(true);
    void navigate({ to: "/dashboard/buyer/listings" }).finally(() => {
      setIsRoutingToVerification(false);
    });
  };

  const startTransaction = async () => {
    if (!resolvedListing) return;
    try {
      await createTransaction.mutateAsync(resolvedListing.id);
      toast.success("Transaction started", {
        description: "Continue from your buyer dashboard to complete payment when ready.",
      });
      navigate({ to: "/dashboard/buyer/transactions" });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not start transaction");
    }
  };

  const handleMakeOffer = async () => {
    if (!isAuthenticated) {
      void navigate({ to: "/login" });
      return;
    }
    if (!isBuyer || !listing || listing.status !== "LIVE") {
      toast.error("Only buyers can make offers on live listings.");
      return;
    }
    try {
      await createTransaction.mutateAsync(listing.id);
      navigate({ to: "/dashboard/buyer/transactions" });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create offer.");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-6 py-16 text-center text-sm text-muted-foreground">
          Loading…
        </main>
      </div>
    );
  }

  if (!isLoading && isError) {
    const nf =
      error instanceof ApiError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN");
    if (nf) {
      return (
        <div className="flex min-h-screen flex-col bg-background">
          <SiteHeader />
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <h1 className="text-2xl font-semibold text-foreground">Listing not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This property is unavailable or you do not have access.
            </p>
            <Button asChild className="mt-6">
              <Link to="/">Go home</Link>
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <h1 className="text-xl font-semibold text-foreground">Could not load listing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Something went wrong."}
          </p>
          <Button className="mt-6" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!resolvedListing) {
    return null;
  }

  const priceLabel = formatMoney(resolvedListing.price, resolvedListing.currency);
  const verified = resolvedListing.status === "LIVE";
  const heroDoc = documents?.find((d) => d.category === "listing_hero");
  const heroSrc = heroDoc ? uploadAssetUrl(heroDoc.storageKey) : PLACEHOLDER_IMG;
  const galleryPhotos = (documents ?? []).filter((d) => d.category === "listing_gallery");
  const verificationDocs = (documents ?? []).filter(
    (d) => d.category !== "listing_hero" && d.category !== "listing_gallery",
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
          <img
            src={heroSrc}
            alt={resolvedListing.title}
            className="aspect-[21/9] w-full object-cover"
          />
        </div>

        {galleryPhotos.length > 0 && (
          <section className="mt-4" aria-label="Property gallery">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {galleryPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="overflow-hidden rounded-lg border border-border/60 bg-muted aspect-square"
                >
                  <img
                    src={uploadAssetUrl(photo.storageKey)}
                    alt={photo.fileName}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {resolvedListing.location}
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                  {resolvedListing.title}
                </h1>
                {resolvedListing.sellerName && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Listed by {resolvedListing.sellerName}
                  </p>
                )}
              </div>
              {verified && (
                <Badge className="gap-1 border-primary/20 bg-primary-soft text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" /> Live listing
                </Badge>
              )}
            </div>

            <p className="mt-6 border-y border-border/60 py-4 text-sm text-muted-foreground">
              {formatListingSpecSummary(resolvedListing)}
            </p>

            <section className="mt-8">
              <h2 className="text-lg font-semibold">About this property</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {resolvedListing.description}
              </p>
            </section>

            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Documents</h2>
                <span className="text-xs text-muted-foreground">
                  {!isAuthenticated
                    ? "Sign in to view uploaded documents."
                    : docsLoading
                      ? "Loading…"
                      : `${verificationDocs.length} on file`}
                </span>
              </div>
              {!isAuthenticated && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Log in as a buyer or seller to see document uploads.
                </p>
              )}
              {isAuthenticated && docsLoading && (
                <p className="mt-3 text-sm text-muted-foreground">Loading documents…</p>
              )}
              {isAuthenticated && !docsLoading && verificationDocs.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  No documents uploaded for this listing yet.
                </p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {verificationDocs.map((d) => (
                  <div
                    key={d.id}
                    className="flex min-w-0 items-center justify-between rounded-lg border border-border/60 bg-card px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{d.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.mimeType} · {formatSize(d.sizeBytes)} · {d.category.replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Asking price
              </p>
              <p className="mt-2 text-3xl font-semibold text-primary">{priceLabel}</p>
              {canStartTransaction ? (
                <Button
                  className="mt-5 w-full"
                  size="lg"
                  onClick={() => void startTransaction()}
                  disabled={createTransaction.isPending}
                >
                  <PlayCircle className="mr-2 h-4 w-4" />
                  {createTransaction.isPending ? "Starting…" : "Start transaction"}
                </Button>
              ) : (
                <Button
                  className="mt-5 w-full"
                  size="lg"
                  onClick={openVerificationStatus}
                  disabled={isRoutingToVerification}
                >
                  <PlayCircle className="mr-2 h-4 w-4" />
                  {isRoutingToVerification ? "Opening verification…" : "View verification status"}
                </Button>
              )}
              <Button
                variant="outline"
                className="mt-2 w-full"
                type="button"
                onClick={() => void handleMakeOffer()}
                disabled={
                  createTransaction.isPending || !isBuyer || resolvedListing?.status !== "LIVE"
                }
              >
                Make an offer
              </Button>
              <Button variant="ghost" className="mt-1 w-full" type="button" disabled>
                Schedule visit
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Independent verification by SafeBuyRealties experts.
              </p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
              <h3 className="font-semibold">Verification milestones</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Progress from the verification API.
              </p>
              <div className="mt-5">
                {!isAuthenticated && (
                  <p className="text-sm text-muted-foreground">
                    Sign in to see verification steps for this listing.
                  </p>
                )}
                {isAuthenticated && verLoading && (
                  <p className="text-sm text-muted-foreground">Loading steps…</p>
                )}
                {isAuthenticated && verError && (
                  <p className="text-sm text-muted-foreground">
                    Verification details are not available for your role.
                  </p>
                )}
                {isAuthenticated &&
                  !verLoading &&
                  !verError &&
                  trackerSteps &&
                  trackerSteps.length > 0 && <VerificationTracker steps={trackerSteps} />}
                {isAuthenticated &&
                  !verLoading &&
                  !verError &&
                  (!trackerSteps || trackerSteps.length === 0) && (
                    <p className="text-sm text-muted-foreground">
                      No verification steps yet (listing not in review).
                    </p>
                  )}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
