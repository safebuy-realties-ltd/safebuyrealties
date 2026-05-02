import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  MapPin,
  BedDouble,
  Bath,
  Maximize,
  FileText,
  CheckCircle2,
  Download,
  PlayCircle,
} from "lucide-react";
import { VerificationTracker, defaultVerificationSteps } from "@/components/VerificationTracker";
import { toast } from "sonner";
import { useListingQuery } from "@/hooks/use-listings";
import { useAuth } from "@/lib/auth";
import { useCreateTransactionMutation } from "@/hooks/use-transactions";
import { ApiError } from "@/lib/api";

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80";

const documents = [
  { name: "Title deed", size: "1.2 MB", verified: true },
  { name: "Survey plan", size: "880 KB", verified: true },
  { name: "Structural report", size: "2.1 MB", verified: true },
  { name: "Tax clearance", size: "640 KB", verified: false },
];

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

function ListingDetail() {
  const { listingId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { data: listing, isLoading, isError, error, refetch } = useListingQuery(listingId);
  const createTransaction = useCreateTransactionMutation();
  const [verificationStarted, setVerificationStarted] = useState(false);

  const isBuyer = isAuthenticated && user?.role === "buyer";
  const canStartTransaction = isBuyer && listing?.status === "LIVE";

  const startVerification = () => {
    setVerificationStarted(true);
    toast.success("Verification request submitted", {
      description: "Our team will reach out within 24 hours to begin the process.",
    });
  };

  const startTransaction = async () => {
    if (!listing) return;
    try {
      await createTransaction.mutateAsync(listing.id);
      toast.success("Transaction started", {
        description: "Continue from your buyer dashboard to complete payment when ready.",
      });
      navigate({ to: "/dashboard/buyer/transactions" });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not start transaction");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-6 py-16 text-center text-sm text-muted-foreground">Loading…</main>
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
            <p className="mt-2 text-sm text-muted-foreground">This property is unavailable or you do not have access.</p>
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

  if (!listing) {
    return null;
  }

  const priceLabel = formatMoney(listing.price, listing.currency);
  const verified = listing.status === "LIVE";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
          <img src={PLACEHOLDER_IMG} alt={listing.title} className="aspect-[21/9] w-full object-cover" />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {listing.location}
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">{listing.title}</h1>
              </div>
              {verified && (
                <Badge className="gap-1 border-primary/20 bg-primary-soft text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" /> Live listing
                </Badge>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-6 border-y border-border/60 py-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <BedDouble className="h-4 w-4" /> —
              </span>
              <span className="flex items-center gap-1.5">
                <Bath className="h-4 w-4" /> —
              </span>
              <span className="flex items-center gap-1.5">
                <Maximize className="h-4 w-4" /> —
              </span>
            </div>

            <section className="mt-8">
              <h2 className="text-lg font-semibold">About this property</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{listing.description}</p>
            </section>

            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Documents</h2>
                <span className="text-xs text-muted-foreground">
                  {documents.filter((d) => d.verified).length} of {documents.length} verified
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {documents.map((d) => (
                  <div
                    key={d.name}
                    className="flex min-w-0 items-center justify-between rounded-lg border border-border/60 bg-card px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          PDF · {d.size} · {d.verified ? "Verified" : "Pending"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {d.verified && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Download ${d.name}`}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Asking price</p>
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
                  onClick={startVerification}
                  disabled={verificationStarted || (isBuyer && listing.status !== "LIVE")}
                >
                  <PlayCircle className="mr-2 h-4 w-4" />
                  {verificationStarted
                    ? "Verification requested"
                    : isBuyer
                      ? "Listing not available for purchase"
                      : "Start verification"}
                </Button>
              )}
              <Button variant="outline" className="mt-2 w-full" type="button" disabled>
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
              <p className="mt-1 text-xs text-muted-foreground">Live status with timestamps for every step.</p>
              <div className="mt-5">
                <VerificationTracker steps={defaultVerificationSteps} />
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
