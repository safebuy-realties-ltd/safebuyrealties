import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  MapPin,
  FileText,
  CheckCircle2,
  ClipboardList,
  CalendarDays,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { VerificationTracker, type VerificationStep } from "@/components/VerificationTracker";
import {
  useListingQuery,
  usePublicListingDocumentsQuery,
  type ListingMediaDto,
} from "@/hooks/use-listings";
import { useAuth } from "@/lib/auth";
import { API_BASE_URL, ApiError } from "@/lib/api";
import { useListingDocumentsQuery } from "@/hooks/use-documents";
import { useVerificationListingQuery, type VerificationStepDto } from "@/hooks/use-verification";
import { formatListingSpecSummary, formatBuildType } from "@/lib/listing-spec";
import { listingIsPubliclyViewable, statusBadgeClass, statusLabel } from "@/lib/listing-status";
import { ListingSaveButton } from "@/components/ListingSaveButton";
import { ScheduleInspectionDialog } from "@/components/ScheduleInspectionDialog";
import { useListingInspectionsQuery } from "@/hooks/use-inspections";

const PLACEHOLDER_IMG = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80";

function uploadAssetUrl(storageKey: string): string {
  const origin = API_BASE_URL.replace(/\/api\/v\d+\/?$/, "");
  return `${origin}/uploads/${storageKey}`;
}

export const Route = createFileRoute("/listings/$listingId")({
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

function listingPhotos(media: ListingMediaDto[] | undefined) {
  const hero = media?.find((m) => m.type === "hero");
  const gallery = (media ?? []).filter((m) => m.type === "gallery");
  return {
    heroSrc: hero ? uploadAssetUrl(hero.storageKey) : PLACEHOLDER_IMG,
    gallery,
  };
}

function ListingDetail() {
  const { listingId } = Route.useParams();
  const { user, isAuthenticated, isReady } = useAuth();
  const { data: listing, isLoading, isError, error, refetch } = useListingQuery(listingId);
  const verificationSectionId = "listing-verification-milestones";

  const isPublicListing =
    !!listing && listingIsPubliclyViewable(listing.status, listing.isPublished);

  const canFetchAuthExtras = isReady && isAuthenticated && !!listingId;
  const { data: authDocuments, isLoading: authDocsLoading } = useListingDocumentsQuery(
    canFetchAuthExtras && !isPublicListing ? listingId : null,
  );
  const { data: publicDocuments, isLoading: publicDocsLoading } = usePublicListingDocumentsQuery(
    isPublicListing ? listingId : null,
  );
  const {
    data: verSteps,
    isLoading: verLoading,
    isError: verError,
  } = useVerificationListingQuery(listingId, canFetchAuthExtras);

  const isBuyer = isAuthenticated && user?.role === "buyer";
  const resolvedListing = listing;
  const isLive = resolvedListing?.status === "LIVE";
  const isUnderOffer = resolvedListing?.status === "UNDER_OFFER";
  const canStartGuestCheckout = isPublicListing && isLive;
  const canStartBuyerCheckout = isBuyer && isLive;
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [copiedListingId, setCopiedListingId] = useState(false);
  const { data: inspections } = useListingInspectionsQuery(
    isBuyer && canFetchAuthExtras ? listingId : null,
  );

  const trackerSteps = useMemo((): VerificationStep[] | null => {
    if (!verSteps?.length) return null;
    return mapVerificationSteps(verSteps);
  }, [verSteps]);

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
  const { heroSrc, gallery } = listingPhotos(resolvedListing.media);
  const propertyTypeLabel =
    formatBuildType(resolvedListing.propertyType ?? resolvedListing.buildType) ?? null;
  const docsLoading = isPublicListing ? publicDocsLoading : authDocsLoading;
  const documentNames = isPublicListing
    ? (publicDocuments ?? []).map((d) => d.name)
    : (authDocuments ?? [])
        .filter((d) => d.category !== "listing_hero" && d.category !== "listing_gallery")
        .map((d) => d.fileName);

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

        {gallery.length > 0 && (
          <section className="mt-4" aria-label="Property gallery">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {gallery.map((photo) => (
                <div
                  key={photo.id}
                  className="aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted"
                >
                  <img
                    src={uploadAssetUrl(photo.storageKey)}
                    alt={`${resolvedListing.title} gallery`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="order-2 lg:order-none lg:col-span-2">
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
                {resolvedListing.propertyId && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Property ID: {resolvedListing.propertyId}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground">Listing ID</p>
                  <code className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-mono text-xs text-foreground">
                    {listingId}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      void (async () => {
                        try {
                          await navigator.clipboard.writeText(listingId);
                          setCopiedListingId(true);
                          toast.success("Listing ID copied");
                          window.setTimeout(() => setCopiedListingId(false), 2000);
                        } catch {
                          toast.error("Could not copy Listing ID. Please copy it manually.");
                        }
                      })();
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    {copiedListingId ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              {isLive && (
                <Badge className="gap-1 border-primary/20 bg-primary-soft text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" /> Live listing
                </Badge>
              )}
              {isUnderOffer && (
                <Badge variant="outline" className={statusBadgeClass("UNDER_OFFER")}>
                  {statusLabel("UNDER_OFFER")}
                </Badge>
              )}
            </div>

            <div className="mt-6 space-y-2 border-y border-border/60 py-4 text-sm text-muted-foreground">
              <p>{formatListingSpecSummary(resolvedListing)}</p>
              {propertyTypeLabel && (
                <p>
                  <span className="font-medium text-foreground">Property type:</span>{" "}
                  {propertyTypeLabel}
                </p>
              )}
            </div>

            <section className="mt-8">
              <h2 className="text-lg font-semibold">About this property</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {resolvedListing.description}
              </p>
            </section>

            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Documents on file</h2>
                <span className="text-xs text-muted-foreground">
                  {docsLoading ? "Loading…" : `${documentNames.length} listed`}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Document names are shown for transparency. Full files are available to verified
                buyers after due diligence begins.
              </p>
              {docsLoading && (
                <p className="mt-3 text-sm text-muted-foreground">Loading documents…</p>
              )}
              {!docsLoading && documentNames.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  No documents listed for this property yet.
                </p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {documentNames.map((name) => (
                  <div
                    key={name}
                    className="flex min-w-0 items-center justify-between rounded-lg border border-border/60 bg-card px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <FileText className="h-4 w-4" />
                      </span>
                      <p className="truncate text-sm font-medium">{name}</p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="order-1 space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Asking price
              </p>
              <p className="mt-2 text-3xl font-semibold text-primary">{priceLabel}</p>

              {(isLive || isUnderOffer) && (
                <>
                  <Button className="mt-5 w-full" size="lg" asChild>
                    <Link to="/due-diligence/request" search={{ listingId }}>
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Request due diligence
                    </Link>
                  </Button>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Opens the due diligence request with this listing already selected — no account
                    required. Listing ID is also shown above if you need to paste it later.
                  </p>
                </>
              )}

              {canStartGuestCheckout && (
                <>
                  <Button className="mt-3 w-full" variant="secondary" size="lg" asChild>
                    <Link to="/checkout/$listingId" params={{ listingId }}>
                      Continue listed checkout
                    </Link>
                  </Button>

                  <div className="mt-5 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">Schedule inspection</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Book a physical visit to inspect the property.
                    </p>
                    <Button className="mt-3 w-full" variant="outline" size="sm" asChild>
                      <Link
                        to="/checkout/$listingId"
                        params={{ listingId }}
                        search={{ inspection: true }}
                      >
                        <CalendarDays className="mr-2 h-4 w-4" />
                        Schedule inspection
                      </Link>
                    </Button>
                  </div>
                </>
              )}

              {canStartBuyerCheckout && (
                <Button className="mt-3 w-full" variant="secondary" size="lg" asChild>
                  <Link to="/purchase/$listingId" params={{ listingId }}>
                    Continue to purchase (signed in)
                  </Link>
                </Button>
              )}

              {isBuyer && isLive && (
                <Button
                  variant="outline"
                  className="mt-2 w-full"
                  type="button"
                  onClick={() => setInspectionOpen(true)}
                >
                  Schedule inspection (dashboard)
                </Button>
              )}

              {isBuyer && isUnderOffer && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  This property is currently under offer.
                </p>
              )}

              {isBuyer && (isLive || isUnderOffer) && (
                <div className="mt-3 flex justify-center">
                  <ListingSaveButton listingId={listingId} />
                </div>
              )}

              {isBuyer && inspections && inspections.length > 0 && (
                <div className="mt-4 rounded-lg border border-border/60 p-3 text-left">
                  <p className="text-xs font-medium text-muted-foreground">Your inspections</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {inspections.map((s) => (
                      <li key={s.id}>
                        {new Date(s.scheduledAt).toLocaleString()} — {s.status}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!canStartGuestCheckout && !canStartBuyerCheckout && (
                <Button className="mt-5 w-full" size="lg" variant="outline" asChild>
                  <Link to="/browse">Browse live listings</Link>
                </Button>
              )}

              <p className="mt-3 text-center text-xs text-muted-foreground">
                Independent verification by SafeBuyRealties experts.
              </p>
            </div>

            {isAuthenticated && (
              <div
                id={verificationSectionId}
                className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]"
              >
                <h3 className="font-semibold">Verification milestones</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Progress from the verification API.
                </p>
                <div className="mt-5">
                  {verLoading && <p className="text-sm text-muted-foreground">Loading steps…</p>}
                  {verError && (
                    <p className="text-sm text-muted-foreground">
                      Verification details are not available for your role.
                    </p>
                  )}
                  {!verLoading && !verError && trackerSteps && trackerSteps.length > 0 && (
                    <VerificationTracker steps={trackerSteps} />
                  )}
                  {!verLoading && !verError && (!trackerSteps || trackerSteps.length === 0) && (
                    <p className="text-sm text-muted-foreground">
                      No verification steps yet (listing not in review).
                    </p>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
      {isBuyer && (
        <ScheduleInspectionDialog
          listingId={listingId}
          open={inspectionOpen}
          onOpenChange={setInspectionOpen}
        />
      )}
    </div>
  );
}
