import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  CreditCard,
  Loader2,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import ServiceSelector from "@/components/ServiceSelector";
import { useListingQuery } from "@/hooks/use-listings";
import { useListingDocumentsQuery } from "@/hooks/use-documents";
import { useAuth } from "@/lib/auth";
import { API_BASE_URL, ApiError } from "@/lib/api";
import { formatListingSpecSummary } from "@/lib/listing-spec";
import {
  clearWizardState,
  defaultWizardState,
  isBuyerInfoComplete,
  isServiceSelectionValid,
  loadWizardState,
  saveWizardState,
  stepIndex,
  stepLabel,
  stepProgressPercent,
  WIZARD_STEPS,
  type BuyerInfo,
  type PurchaseWizardState,
  type ServiceSelection,
  type WizardStep,
} from "@/lib/purchase-wizard";
import { PoAExecutionScreen } from "@/components/PoAExecutionScreen";
import { useCreateTransactionMutation, useMyTransactionsQuery } from "@/hooks/use-transactions";
import { useCreateDueDiligenceOrderMutation } from "@/hooks/use-due-diligence-order";
import { useInitiatePaymentMutation, useVerifyPaymentMutation } from "@/hooks/use-payments";
import { useServiceBundlesQuery, useServiceItemsQuery } from "@/hooks/use-service-catalog";
import { openPaystackCheckout } from "@/lib/paystack";
import { toast } from "sonner";

const PLACEHOLDER_IMG = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80";

export const Route = createFileRoute("/purchase/$listingId")({
  component: PurchaseWizardPage,
});

function uploadAssetUrl(storageKey: string): string {
  const origin = API_BASE_URL.replace(/\/api\/v\d+\/?$/, "");
  return `${origin}/uploads/${storageKey}`;
}

function formatNgn(amount: number | string) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return `₦${amount}`;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
}

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

function PurchaseWizardPage() {
  const { listingId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, isReady } = useAuth();
  const { data: listing, isLoading, isError, error } = useListingQuery(listingId);
  const { data: documents } = useListingDocumentsQuery(isAuthenticated ? listingId : null);
  const { data: myTransactions, refetch: refetchTransactions } = useMyTransactionsQuery();

  const [wizard, setWizard] = useState<PurchaseWizardState>(() => defaultWizardState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadWizardState(listingId);
    if (stored) setWizard(stored);
    setHydrated(true);
  }, [listingId]);

  useEffect(() => {
    if (!hydrated || wizard.step === "SUCCESS") return;
    saveWizardState(listingId, wizard);
  }, [wizard, listingId, hydrated]);

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated) {
      void navigate({ to: "/login" });
      return;
    }
    if (user?.role !== "buyer") {
      toast.error("Only buyers can start due diligence.");
      void navigate({ to: "/listings/$listingId", params: { listingId } });
    }
  }, [isReady, isAuthenticated, user?.role, navigate, listingId]);

  const patchWizard = useCallback((patch: Partial<PurchaseWizardState>) => {
    setWizard((prev) => ({ ...prev, ...patch }));
  }, []);

  const goToStep = useCallback(
    (step: WizardStep) => {
      patchWizard({ step });
    },
    [patchWizard],
  );

  const goNext = useCallback(() => {
    const idx = stepIndex(wizard.step);
    if (idx < WIZARD_STEPS.length - 1) {
      goToStep(WIZARD_STEPS[idx + 1]!);
    }
  }, [wizard.step, goToStep]);

  const goBack = useCallback(() => {
    const idx = stepIndex(wizard.step);
    if (idx > 0) {
      goToStep(WIZARD_STEPS[idx - 1]!);
    }
  }, [wizard.step, goToStep]);

  const handleSuccess = useCallback(() => {
    clearWizardState(listingId);
    patchWizard({ step: "SUCCESS" });
  }, [listingId, patchWizard]);

  const handlePoaReady = useCallback(
    (txId: string) => {
      patchWizard({ transactionId: txId });
    },
    [patchWizard],
  );

  const handlePoaExecuted = useCallback(
    (poa: { poaId: string; poaDocumentHash: string }) => {
      patchWizard({ poaId: poa.poaId, poaDocumentHash: poa.poaDocumentHash });
    },
    [patchWizard],
  );

  if (!isReady || !hydrated) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-muted-foreground">
          Loading…
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-muted-foreground">
          Loading property…
        </main>
      </div>
    );
  }

  if (isError || !listing) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Could not load listing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Something went wrong."}
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Go home</Link>
          </Button>
        </main>
      </div>
    );
  }

  if (listing.status !== "LIVE") {
    const underOffer = listing.status === "UNDER_OFFER";
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">
            {underOffer ? "Property under offer" : "Due diligence unavailable"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {underOffer
              ? "This property is currently under offer and cannot be reserved by another buyer."
              : "Due diligence can only be started on live, verified listings."}
          </p>
          <Button asChild className="mt-6">
            <Link to="/listings/$listingId" params={{ listingId }}>
              Back to listing
            </Link>
          </Button>
        </main>
      </div>
    );
  }

  const heroDoc = documents?.find((d) => d.category === "listing_hero");
  const heroSrc = heroDoc ? uploadAssetUrl(heroDoc.storageKey) : PLACEHOLDER_IMG;
  const progress = stepProgressPercent(wizard.step);
  const currentStepNum = stepIndex(wizard.step) + 1;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/listings/$listingId" params={{ listingId }}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to listing
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Step {currentStepNum} of {WIZARD_STEPS.length}: {stepLabel(wizard.step)}
          </p>
        </div>

        {wizard.step !== "SUCCESS" && (
          <div className="mb-8">
            <Progress value={progress} className="h-2" />
            <div className="mt-3 hidden gap-2 sm:flex sm:flex-wrap">
              {WIZARD_STEPS.slice(0, -1).map((s, i) => {
                const done = stepIndex(wizard.step) > i;
                const current = wizard.step === s;
                return (
                  <span
                    key={s}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      current
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {stepLabel(s)}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {wizard.step === "PROPERTY_CONFIRMATION" && (
          <PropertyConfirmationStep listing={listing} heroSrc={heroSrc} onNext={goNext} />
        )}

        {wizard.step === "BUYER_INFO" && (
          <BuyerInfoStep
            buyerInfo={wizard.buyerInfo}
            defaultName={user?.name ?? ""}
            defaultEmail={user?.email ?? ""}
            onBack={goBack}
            onNext={(buyerInfo) => {
              patchWizard({ buyerInfo });
              goNext();
            }}
          />
        )}

        {wizard.step === "POA_EXECUTION" && (
          <PoaExecutionStep
            listingId={listingId}
            listingTitle={listing.title}
            listingAddress={listing.location}
            buyerName={wizard.buyerInfo?.legalName}
            transactionId={wizard.transactionId}
            poaId={wizard.poaId}
            poaDocumentHash={wizard.poaDocumentHash}
            myTransactions={myTransactions}
            onBack={goBack}
            onReady={handlePoaReady}
            onExecuted={handlePoaExecuted}
            onContinue={() => goToStep("SERVICE_SELECTION")}
            refetchTransactions={refetchTransactions}
          />
        )}

        {wizard.step === "SERVICE_SELECTION" && (
          <ServiceSelectionStep
            onBack={goBack}
            onNext={(serviceSelection) => {
              patchWizard({ serviceSelection });
              goNext();
            }}
          />
        )}

        {wizard.step === "ORDER_SUMMARY" && (
          <OrderSummaryStep
            listingId={listingId}
            serviceSelection={wizard.serviceSelection}
            transactionId={wizard.transactionId}
            myTransactions={myTransactions}
            onBack={goBack}
            onConfirmed={(data) => {
              patchWizard({
                transactionId: data.transactionId,
                ddOrderId: data.ddOrderId,
                serviceSelection: data.serviceSelection,
                step: "PAYMENT",
              });
            }}
            refetchTransactions={refetchTransactions}
          />
        )}

        {wizard.step === "PAYMENT" && (
          <PaymentStep
            listingId={listingId}
            listingTitle={listing.title}
            currency={listing.currency}
            wizard={wizard}
            onBack={() => goToStep("ORDER_SUMMARY")}
            onSuccess={handleSuccess}
            patchWizard={patchWizard}
          />
        )}

        {wizard.step === "SUCCESS" && (
          <SuccessStep
            transactionId={wizard.transactionId}
            paymentReference={wizard.paymentReference}
          />
        )}
      </main>
    </div>
  );
}

type ListingShape = NonNullable<ReturnType<typeof useListingQuery>["data"]>;

function PropertyConfirmationStep({
  listing,
  heroSrc,
  onNext,
}: {
  listing: ListingShape;
  heroSrc: string;
  onNext: () => void;
}) {
  const priceLabel = formatMoney(listing.price, listing.currency);
  const verifiedAt = listing.verifiedAt ? new Date(listing.verifiedAt).toLocaleDateString() : null;

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <img src={heroSrc} alt={listing.title} className="aspect-[21/9] w-full object-cover" />
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {listing.location}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{listing.title}</h1>
            </div>
            <Badge className="gap-1 border-primary/20 bg-primary-soft text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified{verifiedAt ? ` · ${verifiedAt}` : ""}
            </Badge>
          </div>
          <p className="mt-4 text-3xl font-semibold text-primary">{priceLabel}</p>
          <p className="mt-4 border-t border-border/60 pt-4 text-sm text-muted-foreground">
            {formatListingSpecSummary(listing)}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {listing.description}
          </p>
        </div>
      </div>
      <Button className="w-full" size="lg" onClick={onNext}>
        Proceed to verify identity and start due diligence
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </section>
  );
}

function BuyerInfoStep({
  buyerInfo,
  defaultName,
  defaultEmail,
  onBack,
  onNext,
}: {
  buyerInfo?: BuyerInfo;
  defaultName: string;
  defaultEmail: string;
  onBack: () => void;
  onNext: (info: BuyerInfo) => void;
}) {
  const [form, setForm] = useState<BuyerInfo>({
    legalName: buyerInfo?.legalName ?? defaultName,
    email: buyerInfo?.email ?? defaultEmail,
    phone: buyerInfo?.phone ?? "",
    country: buyerInfo?.country ?? "Nigeria",
    state: buyerInfo?.state ?? "",
  });

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-xl font-semibold">Your information</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        We need your legal details for the due diligence order and Power of Attorney.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="legalName">Full legal name</Label>
          <Input
            id="legalName"
            value={form.legalName}
            onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
            className="mt-1.5"
            required
          />
        </div>
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="mt-1.5"
            required
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="mt-1.5"
            required
          />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input
            id="country"
            value={form.country}
            onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            className="mt-1.5"
            required
          />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            className="mt-1.5"
            required
          />
        </div>
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          className="flex-1"
          disabled={!isBuyerInfoComplete(form)}
          onClick={() => onNext(form)}
        >
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

type TxRow = { id: string; listingId: string; status: string };

function findOpenTransaction(list: TxRow[] | undefined, listingId: string) {
  return list?.find(
    (t) => t.listingId === listingId && (t.status === "INITIATED" || t.status === "IN_PROGRESS"),
  );
}

async function resolveTransactionIdForListing(
  listingId: string,
  transactionId: string | undefined,
  myTransactions: TxRow[] | undefined,
  createTransaction: ReturnType<typeof useCreateTransactionMutation>,
  refetchTransactions: () => Promise<{ data?: TxRow[] }>,
): Promise<string> {
  if (transactionId) return transactionId;
  const open = findOpenTransaction(myTransactions, listingId);
  if (open) return open.id;

  try {
    const tx = await createTransaction.mutateAsync(listingId);
    return tx.id;
  } catch (e) {
    if (e instanceof ApiError && e.code === "CONFLICT") {
      const refreshed = await refetchTransactions();
      const existing = findOpenTransaction(refreshed.data ?? myTransactions, listingId);
      if (existing) return existing.id;
    }
    throw e;
  }
}

function PoaExecutionStep({
  listingId,
  listingTitle,
  listingAddress,
  buyerName,
  transactionId,
  poaId,
  poaDocumentHash,
  myTransactions,
  onBack,
  onReady,
  onExecuted,
  onContinue,
  refetchTransactions,
}: {
  listingId: string;
  listingTitle: string;
  listingAddress: string;
  buyerName?: string;
  transactionId?: string;
  poaId?: string;
  poaDocumentHash?: string;
  myTransactions?: TxRow[];
  onBack: () => void;
  onReady: (transactionId: string) => void;
  onExecuted: (poa: { poaId: string; poaDocumentHash: string }) => void;
  onContinue: () => void;
  refetchTransactions: () => Promise<{ data?: TxRow[] }>;
}) {
  const createTransaction = useCreateTransactionMutation();
  const [resolvedTxId, setResolvedTxId] = useState<string | null>(transactionId ?? null);
  const [resolving, setResolving] = useState(!transactionId);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const myTransactionsRef = useRef(myTransactions);
  myTransactionsRef.current = myTransactions;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (transactionId) {
      setResolvedTxId(transactionId);
      setResolving(false);
      return;
    }

    let cancelled = false;
    setResolving(true);
    setResolveError(null);

    void (async () => {
      try {
        const txId = await resolveTransactionIdForListing(
          listingId,
          transactionId,
          myTransactionsRef.current,
          createTransaction,
          refetchTransactions,
        );
        if (cancelled) return;
        setResolvedTxId(txId);
        onReadyRef.current(txId);
      } catch (e) {
        if (cancelled) return;
        setResolveError(e instanceof ApiError ? e.message : "Could not start transaction.");
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listingId, transactionId, createTransaction, refetchTransactions]);

  if (resolving) {
    return (
      <section className="rounded-2xl border border-border/60 bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Preparing your transaction…</p>
      </section>
    );
  }

  if (resolveError || !resolvedTxId) {
    return (
      <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-xl font-semibold">Power of Attorney</h2>
        <p className="mt-4 text-sm text-destructive">
          {resolveError ?? "Transaction unavailable."}
        </p>
        <Button className="mt-6" variant="outline" onClick={onBack}>
          Back
        </Button>
      </section>
    );
  }

  if (poaId) {
    return (
      <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden />
          <h2 className="text-xl font-semibold">Power of Attorney on file</h2>
          <p className="text-sm text-muted-foreground">
            You have already executed a Power of Attorney for this transaction. Continue to select
            due diligence services.
          </p>
        </div>
        {poaDocumentHash && (
          <div className="mt-6 rounded-lg border bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Document hash (SHA-256)
            </p>
            <p className="mt-2 break-all font-mono text-sm">{poaDocumentHash}</p>
          </div>
        )}
        <div className="mt-8 flex gap-3">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button className="flex-1" onClick={onContinue}>
            Continue to services
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
      <div className="border-b border-border/60 px-6 py-4">
        <h2 className="text-xl font-semibold">Power of Attorney</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Authorise SafeBuyRealties to conduct verification on your behalf before selecting
          services.
        </p>
      </div>
      <PoAExecutionScreen
        transactionId={resolvedTxId}
        buyerName={buyerName}
        listingTitle={listingTitle}
        listingAddress={listingAddress}
        className="px-6 pb-6 pt-2"
        onSuccess={(poa) => onExecuted({ poaId: poa.id, poaDocumentHash: poa.documentHash })}
      />
      <div className="border-t border-border/60 px-6 py-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    </section>
  );
}

function ServiceSelectionStep({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: (selection: ServiceSelection) => void;
}) {
  const [selection, setSelection] = useState<ServiceSelection | undefined>();

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Select due diligence services</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a bundle or pick individual services. VAT (7.5%) is included in the total.
        </p>
      </div>
      <ServiceSelector onSelectionChange={setSelection} />
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          className="flex-1"
          disabled={!isServiceSelectionValid(selection)}
          onClick={() => selection && onNext(selection)}
        >
          Continue to summary
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

function OrderSummaryStep({
  listingId,
  serviceSelection,
  transactionId,
  myTransactions,
  onBack,
  onConfirmed,
  refetchTransactions,
}: {
  listingId: string;
  serviceSelection?: ServiceSelection;
  transactionId?: string;
  myTransactions?: TxRow[];
  onBack: () => void;
  onConfirmed: (data: {
    transactionId: string;
    ddOrderId: string;
    serviceSelection: ServiceSelection;
  }) => void;
  refetchTransactions: () => Promise<{ data?: TxRow[] }>;
}) {
  const createTransaction = useCreateTransactionMutation();
  const createDdOrder = useCreateDueDiligenceOrderMutation();
  const { data: bundles } = useServiceBundlesQuery();
  const { data: items } = useServiceItemsQuery();
  const [submitting, setSubmitting] = useState(false);

  const selection = serviceSelection;
  const bundleName = useMemo(() => {
    if (!selection?.bundleId || !bundles) return null;
    return bundles.find((b) => b.id === selection.bundleId)?.name ?? null;
  }, [selection?.bundleId, bundles]);

  const lineItems = useMemo(() => {
    if (!selection || !items) return [];
    if (selection.bundleId && bundles) {
      const bundle = bundles.find((b) => b.id === selection.bundleId);
      if (bundle) {
        return bundle.items.map((item) => ({
          id: item.id,
          name: item.name,
          price: Number(item.basePrice),
        }));
      }
    }
    return items
      .filter((item) => selection.itemIds.includes(item.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.basePrice),
      }));
  }, [selection, items, bundles]);

  if (!selection || !isServiceSelectionValid(selection)) {
    return (
      <section className="rounded-2xl border border-border/60 bg-card p-6 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm text-muted-foreground">No services selected.</p>
        <Button className="mt-4" variant="outline" onClick={onBack}>
          Back to services
        </Button>
      </section>
    );
  }

  const resolveTransactionId = async (): Promise<string> =>
    resolveTransactionIdForListing(
      listingId,
      transactionId,
      myTransactions,
      createTransaction,
      refetchTransactions,
    );

  const confirmOrder = async () => {
    setSubmitting(true);
    try {
      const txId = await resolveTransactionId();
      const order = await createDdOrder.mutateAsync({
        transactionId: txId,
        bundleId: selection.bundleId,
        itemIds: selection.bundleId ? undefined : selection.itemIds,
      });
      onConfirmed({
        transactionId: txId,
        ddOrderId: order.id,
        serviceSelection: {
          ...selection,
          subtotal: Number(order.subtotal),
          vat: Number(order.vatAmount),
          total: Number(order.total),
        },
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create order.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-xl font-semibold">Order summary</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Review your selection before proceeding to payment.
      </p>

      {bundleName && (
        <p className="mt-4 text-sm font-medium text-foreground">Bundle: {bundleName}</p>
      )}

      <ul className="mt-4 space-y-2 border-y border-border/60 py-4">
        {lineItems.map((item) => (
          <li key={item.id} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-medium">{formatNgn(item.price)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatNgn(selection.subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>VAT (7.5%)</span>
          <span>{formatNgn(selection.vat)}</span>
        </div>
        <div className="flex justify-between text-base font-bold">
          <span>Total</span>
          <span className="text-primary">{formatNgn(selection.total)}</span>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button
          className="flex-1"
          size="lg"
          disabled={submitting}
          onClick={() => void confirmOrder()}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating order…
            </>
          ) : (
            <>Confirm and Pay {formatNgn(selection.total)}</>
          )}
        </Button>
      </div>
    </section>
  );
}

function PaymentStep({
  listingId,
  listingTitle,
  currency,
  wizard,
  onBack,
  onSuccess,
  patchWizard,
}: {
  listingId: string;
  listingTitle: string;
  currency: string;
  wizard: PurchaseWizardState;
  onBack: () => void;
  onSuccess: () => void;
  patchWizard: (patch: Partial<PurchaseWizardState>) => void;
}) {
  const payMutation = useInitiatePaymentMutation();
  const verifyMutation = useVerifyPaymentMutation();
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const total = wizard.serviceSelection?.total ?? 0;
  const txId = wizard.transactionId;
  const ddOrderId = wizard.ddOrderId;

  const handlePaymentSuccess = (paymentId: string, reference: string) => {
    patchWizard({ paymentId, paymentReference: reference });
    onSuccess();
  };

  const initiatePayment = () => {
    if (!txId || !ddOrderId || total <= 0) {
      toast.error("Missing order details. Go back to summary.");
      return;
    }
    setPaymentError(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const callbackUrl = `${origin}/purchase/${listingId}?step=payment`;

    payMutation.mutate(
      {
        amount: total,
        currency: currency || "NGN",
        transactionId: txId,
        listingId,
        callbackUrl,
        intent: "DD_SERVICE",
        ddOrderId,
      },
      {
        onSuccess: (res) => {
          patchWizard({ paymentId: res.paymentId, paymentReference: res.reference });

          if (res.authorizationUrl.includes("mock=1") || !res.accessCode) {
            toast.success("Payment completed (demo mode).");
            handlePaymentSuccess(res.paymentId, res.reference);
            return;
          }

          void openPaystackCheckout({
            accessCode: res.accessCode,
            onSuccess: () => {
              verifyMutation.mutate(res.paymentId, {
                onSuccess: () => {
                  toast.success("Payment confirmed.");
                  handlePaymentSuccess(res.paymentId, res.reference);
                },
                onError: () => {
                  toast.message("Payment received — confirming shortly.");
                },
              });
            },
            onCancel: () => toast.message("Payment window closed."),
            onError: (err) => {
              setPaymentError(err.message || "Payment failed.");
            },
          });
        },
        onError: (e) => {
          setPaymentError(e instanceof ApiError ? e.message : "Payment could not start.");
        },
      },
    );
  };

  const simulateSuccess = () => {
    const paymentId = wizard.paymentId;
    if (!paymentId) {
      toast.error("Start payment first.");
      return;
    }
    verifyMutation.mutate(paymentId, {
      onSuccess: (payment) => {
        toast.success("Payment simulated successfully.");
        handlePaymentSuccess(
          payment.id,
          wizard.paymentReference ?? payment.providerReference ?? "",
        );
      },
      onError: (e) => {
        toast.error(e instanceof ApiError ? e.message : "Verification failed.");
      },
    });
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-xl font-semibold">Payment</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Complete payment for due diligence on <span className="font-medium">{listingTitle}</span>.
      </p>

      <div className="mt-6 rounded-xl bg-muted/50 p-5">
        <p className="text-sm text-muted-foreground">Amount due</p>
        <p className="mt-1 text-3xl font-bold text-primary">{formatNgn(total)}</p>
        <p className="mt-2 text-xs text-muted-foreground">Due Diligence Payment · Paystack</p>
      </div>

      {paymentError && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {paymentError}
          <Button variant="link" className="ml-2 h-auto p-0 text-destructive" onClick={onBack}>
            Try again
          </Button>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" onClick={onBack} disabled={payMutation.isPending}>
          Back
        </Button>
        <Button
          className="flex-1"
          size="lg"
          onClick={() => initiatePayment()}
          disabled={payMutation.isPending || verifyMutation.isPending}
        >
          {payMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting checkout…
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay {formatNgn(total)}
            </>
          )}
        </Button>
      </div>

      <Button
        variant="secondary"
        className="mt-3 w-full"
        onClick={() => simulateSuccess()}
        disabled={!wizard.paymentId || verifyMutation.isPending}
      >
        Simulate Payment Success
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Development only — verifies payment via the API after checkout starts.
      </p>
    </section>
  );
}

function SuccessStep({
  transactionId,
  paymentReference,
}: {
  transactionId?: string;
  paymentReference?: string;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-8 text-center shadow-[var(--shadow-card)]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold">Due diligence purchased</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Thank you. Our team will begin verification on this property. You will receive updates as
        work progresses — typical turnaround is 5–10 business days.
      </p>
      {transactionId && (
        <p className="mt-4 text-sm">
          Transaction reference:{" "}
          <span className="font-mono font-medium text-foreground">{transactionId}</span>
        </p>
      )}
      {paymentReference && (
        <p className="mt-1 text-xs text-muted-foreground">
          Payment reference: <span className="font-mono">{paymentReference}</span>
        </p>
      )}
      <Button asChild className="mt-8" size="lg">
        <Link to="/dashboard/buyer/transactions">
          View my transactions
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </section>
  );
}
