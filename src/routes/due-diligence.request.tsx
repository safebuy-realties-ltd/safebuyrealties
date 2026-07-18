import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { DdCheckSelector, type DdCheckSelection } from "@/components/DdCheckSelector";
import { DdOrderConfirmation } from "@/components/DdOrderConfirmation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useListingQuery } from "@/hooks/use-listings";
import { type ServiceBundle, useServiceBundlesQuery } from "@/hooks/use-service-catalog";
import {
  isStandaloneDdPaid,
  useCreateStandaloneDdOrderMutation,
  usePayStandaloneDdOrderMutation,
  useStandaloneDdOrderQuery,
  useVerifyStandaloneDdPaymentMutation,
} from "@/hooks/use-standalone-dd";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { getLgasForState, NIGERIA_STATE_LABELS, NIGERIA_STATES } from "@/lib/nigeria-locations";
import { openPaystackCheckout } from "@/lib/paystack";
import { toast } from "sonner";

export const Route = createFileRoute("/due-diligence/request")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    listingId?: string;
    serviceId?: string;
    ref?: string;
    reference?: string;
    paymentId?: string;
    mock?: string;
  } => ({
    listingId: typeof search.listingId === "string" ? search.listingId : undefined,
    serviceId: typeof search.serviceId === "string" ? search.serviceId : undefined,
    ref: typeof search.ref === "string" ? search.ref : undefined,
    reference: typeof search.reference === "string" ? search.reference : undefined,
    paymentId: typeof search.paymentId === "string" ? search.paymentId : undefined,
    mock: typeof search.mock === "string" ? search.mock : undefined,
  }),
  component: DueDiligenceRequestPage,
});

const STEPS = ["SCHEDULES", "PROPERTY", "CONTACT", "REVIEW"] as const;
type RequestStep = (typeof STEPS)[number];
type PropertySource = "LISTING" | "EXTERNAL";

type ExternalPropertyForm = {
  address: string;
  state: string;
  lga: string;
  propertyType: string;
  approxSize: string;
  titleRef: string;
  sellerName: string;
  sellerContact: string;
  notes: string;
};

type ContactForm = {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
};

function formatNgn(amount: number | string) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return `₦${amount}`;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function stepLabel(step: RequestStep) {
  switch (step) {
    case "SCHEDULES":
      return "Schedules";
    case "PROPERTY":
      return "Property";
    case "CONTACT":
      return "Contact";
    case "REVIEW":
      return "Review & pay";
  }
}

function stepProgress(step: RequestStep) {
  return ((STEPS.indexOf(step) + 1) / STEPS.length) * 100;
}

function isContactValid(form: ContactForm) {
  return form.guestName.trim() && form.guestEmail.trim() && form.guestPhone.trim();
}

function isExternalPropertyValid(form: ExternalPropertyForm) {
  return form.address.trim() && form.state.trim() && form.lga.trim();
}

function fullDdBundle(bundles: ServiceBundle[] | undefined) {
  return bundles?.find((bundle) => bundle.code === "FULL_DD" || bundle.code === "FULL_DD_BUNDLE");
}

function DueDiligenceRequestPage() {
  const {
    listingId: listingIdSearch,
    serviceId: serviceIdSearch,
    ref: refSearch,
    reference: referenceSearch,
    mock: mockSearch,
  } = Route.useSearch();
  const { user, isAuthenticated } = useAuth();
  const { data: bundles } = useServiceBundlesQuery();
  const fullBundle = useMemo(() => fullDdBundle(bundles), [bundles]);
  const [step, setStep] = useState<RequestStep>("SCHEDULES");
  const [propertySource, setPropertySource] = useState<PropertySource>(
    listingIdSearch ? "LISTING" : "EXTERNAL",
  );
  const [listingId, setListingId] = useState(listingIdSearch ?? "");
  const [externalProperty, setExternalProperty] = useState<ExternalPropertyForm>({
    address: "",
    state: "",
    lga: "",
    propertyType: "",
    approxSize: "",
    titleRef: "",
    sellerName: "",
    sellerContact: "",
    notes: "",
  });
  const [selectorSelection, setSelectorSelection] = useState<DdCheckSelection>();
  const [selectedBundleId, setSelectedBundleId] = useState<string | undefined>(fullBundle?.id);
  const [contact, setContact] = useState<ContactForm>({
    guestName: user?.name ?? "",
    guestEmail: user?.email ?? "",
    guestPhone: "",
  });
  const [serviceId, setServiceId] = useState<string | null>(serviceIdSearch ?? null);
  const [paidServiceId, setPaidServiceId] = useState<string | null>(null);
  const [verifyingReturn, setVerifyingReturn] = useState(Boolean(serviceIdSearch));

  const createOrder = useCreateStandaloneDdOrderMutation();
  const payOrder = usePayStandaloneDdOrderMutation();
  const verifyPayment = useVerifyStandaloneDdPaymentMutation();
  const trackServiceId = paidServiceId ?? serviceIdSearch ?? serviceId;
  const { data: paidOrder, refetch: refetchPaidOrder } = useStandaloneDdOrderQuery(trackServiceId);
  const hasConfirmedPayment = isStandaloneDdPaid(paidOrder);
  const shouldResolveListing = propertySource === "LISTING" && listingId.trim().length > 0;
  const { data: listing, isLoading: listingLoading } = useListingQuery(
    shouldResolveListing ? listingId.trim() : "",
  );

  useEffect(() => {
    if (fullBundle?.id && !selectedBundleId) {
      setSelectedBundleId(fullBundle.id);
    }
  }, [fullBundle?.id, selectedBundleId]);

  useEffect(() => {
    if (!serviceIdSearch) {
      setVerifyingReturn(false);
      return;
    }

    let cancelled = false;
    const reference = referenceSearch ?? refSearch;
    setServiceId(serviceIdSearch);
    setVerifyingReturn(true);

    (async () => {
      try {
        if (mockSearch === "1" || reference || paidOrder?.paymentReference) {
          const verified = await verifyPayment.mutateAsync({
            serviceId: serviceIdSearch,
            reference: reference ?? paidOrder?.paymentReference ?? undefined,
          });
          if (!cancelled && isStandaloneDdPaid(verified)) {
            setPaidServiceId(serviceIdSearch);
            toast.success("Payment confirmed. Your due diligence case is open.");
          }
        } else {
          const { data } = await refetchPaidOrder();
          if (!cancelled && isStandaloneDdPaid(data)) {
            setPaidServiceId(serviceIdSearch);
          }
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Could not confirm payment yet. Keep your Service ID and try again shortly.",
          );
        }
      } finally {
        if (!cancelled) setVerifyingReturn(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally run once on return-from-pay params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceIdSearch, mockSearch, refSearch, referenceSearch]);

  const bundlePricing = useMemo(() => {
    if (!fullBundle) return { subtotal: 0, vat: 0, total: 0 };
    const subtotal = Number(fullBundle.basePrice);
    const vat = Math.round(subtotal * 0.075);
    return { subtotal, vat, total: subtotal + vat };
  }, [fullBundle]);

  const activeSelection = useMemo(() => {
    if (selectedBundleId && fullBundle && selectedBundleId === fullBundle.id) {
      return {
        mode: "bundle" as const,
        bundleId: fullBundle.id,
        itemIds: fullBundle.items.map((item) => item.id),
        subtotal: bundlePricing.subtotal,
        vat: bundlePricing.vat,
        total: bundlePricing.total,
      };
    }

    return {
      mode: "items" as const,
      bundleId: undefined,
      itemIds: selectorSelection?.itemIds ?? [],
      subtotal: selectorSelection?.subtotal ?? 0,
      vat: selectorSelection?.vat ?? 0,
      total: selectorSelection?.total ?? 0,
    };
  }, [bundlePricing, fullBundle, selectedBundleId, selectorSelection]);

  const availableLgas = useMemo(
    () => getLgasForState(externalProperty.state),
    [externalProperty.state],
  );
  const propertyStepValid =
    propertySource === "LISTING"
      ? Boolean(listingId.trim() && listing)
      : isExternalPropertyValid(externalProperty);
  const scheduleStepValid = Boolean(selectedBundleId || activeSelection.itemIds.length > 0);
  const canSubmit =
    propertyStepValid &&
    scheduleStepValid &&
    Boolean(isContactValid(contact)) &&
    (!isAuthenticated || user?.role === "buyer");

  const submitOrder = async () => {
    if (!canSubmit) return;
    try {
      const created = await createOrder.mutateAsync({
        listingId: propertySource === "LISTING" ? listingId.trim() : undefined,
        externalProperty:
          propertySource === "EXTERNAL"
            ? {
                address: externalProperty.address.trim(),
                state: externalProperty.state.trim(),
                lga: externalProperty.lga.trim() || undefined,
                propertyType: externalProperty.propertyType.trim() || undefined,
                approxSize: externalProperty.approxSize.trim() || undefined,
                titleRef: externalProperty.titleRef.trim() || undefined,
                sellerName: externalProperty.sellerName.trim() || undefined,
                sellerContact: externalProperty.sellerContact.trim() || undefined,
                notes: externalProperty.notes.trim() || undefined,
              }
            : undefined,
        guestName: contact.guestName.trim(),
        guestEmail: contact.guestEmail.trim(),
        guestPhone: contact.guestPhone.trim(),
        bundleId: activeSelection.bundleId,
        itemIds: activeSelection.bundleId ? undefined : activeSelection.itemIds,
      });
      setServiceId(created.serviceId);

      const callbackUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/due-diligence/request?serviceId=${created.serviceId}`
          : "http://localhost:8080/due-diligence/request";
      const payment = await payOrder.mutateAsync({
        serviceId: created.serviceId,
        body: {
          callbackUrl,
          name: contact.guestName.trim(),
          email: contact.guestEmail.trim(),
          phone: contact.guestPhone.trim(),
        },
      });

      if (!payment.accessCode) {
        throw new Error("Paystack did not return an access code. Check API keys and try again.");
      }

      // Same inline Paystack model as listed-property guest checkout.
      await openPaystackCheckout({
        accessCode: payment.accessCode,
        onSuccess: (transaction) => {
          void (async () => {
            try {
              const verified = await verifyPayment.mutateAsync({
                serviceId: created.serviceId,
                reference: transaction.reference || payment.reference,
              });
              setPaidServiceId(verified.serviceId);
              toast.success("Payment confirmed. Your due diligence case is open.");
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.set("serviceId", verified.serviceId);
                url.searchParams.set("reference", transaction.reference || payment.reference);
                window.history.replaceState({}, "", url.toString());
              }
            } catch (verifyError) {
              toast.error(
                verifyError instanceof ApiError
                  ? verifyError.message
                  : "Payment received but verification is still pending. Keep your Service ID.",
              );
            }
          })();
        },
        onCancel: () => toast.message("Payment window closed. Your Service ID is still available."),
        onError: (err) => toast.error(err.message || "Paystack checkout failed. Please try again."),
      });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not create the due diligence order.",
      );
    }
  };

  const progress = stepProgress(step);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-border/60 bg-[var(--gradient-subtle)]">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/due-diligence">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to due diligence
              </Link>
            </Button>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <Badge className="border-primary/20 bg-primary-soft text-primary">
                  Standalone due diligence
                </Badge>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Request Schedules A-D for any property
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                  Start by choosing the schedules and prices you need, then add property and contact
                  details to pay and open a due diligence case.
                </p>
              </div>
              {serviceId && (
                <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm shadow-[var(--shadow-card)]">
                  <p className="text-muted-foreground">Service ID</p>
                  <p className="mt-1 font-mono font-medium text-foreground">{serviceId}</p>
                </div>
              )}
            </div>
            {!hasConfirmedPayment && (
              <div className="mt-8">
                <div className="mb-3 flex flex-wrap gap-2">
                  {STEPS.map((entry) => (
                    <span
                      key={entry}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        step === entry
                          ? "bg-primary text-primary-foreground"
                          : STEPS.indexOf(entry) < STEPS.indexOf(step)
                            ? "bg-primary/15 text-primary"
                            : "bg-card text-muted-foreground"
                      }`}
                    >
                      {stepLabel(entry)}
                    </span>
                  ))}
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-10">
          {isAuthenticated && user?.role !== "buyer" && !hasConfirmedPayment && (
            <div className="mb-6 rounded-2xl border border-warning/40 bg-warning/10 px-5 py-4 text-sm text-foreground">
              You are signed in as <strong>{user?.role}</strong>. This flow supports guests or
              signed-in buyers only. Sign out or switch to a buyer account before paying.
            </div>
          )}

          {verifyingReturn && !hasConfirmedPayment ? (
            <div className="rounded-3xl border border-border/60 bg-card p-8 text-center shadow-[var(--shadow-card)]">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <h2 className="mt-4 text-xl font-semibold">Confirming your payment…</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Hang tight while we verify the charge and open your due diligence case.
              </p>
            </div>
          ) : hasConfirmedPayment && paidOrder ? (
            <DdOrderConfirmation
              order={paidOrder}
              isAuthenticatedBuyer={Boolean(isAuthenticated && user?.role === "buyer")}
            />
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                {step === "SCHEDULES" && (
                  <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
                    <h2 className="text-xl font-semibold">1. Select the due diligence schedules</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Choose the services you need first — each schedule shows its price. You can
                      take the full Schedule A–D bundle or pick individual checks.
                    </p>
                    {fullBundle && (
                      <div className="mt-6 rounded-2xl border border-border/60 bg-secondary/40 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 text-sm text-primary">
                              <FileCheck2 className="h-4 w-4" />
                              Recommended
                            </div>
                            <p className="mt-2 text-lg font-semibold text-foreground">
                              {fullBundle.name}
                            </p>
                            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                              {fullBundle.description}
                            </p>
                            <ul className="mt-4 grid gap-2 text-sm text-foreground md:grid-cols-2">
                              {fullBundle.items.map((item) => (
                                <li key={item.id} className="flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-primary" />
                                  <span className="flex-1">{item.name}</span>
                                  <span className="font-medium text-primary">
                                    {formatNgn(item.basePrice)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="min-w-44 rounded-2xl border border-border/60 bg-card px-4 py-3 text-right shadow-[var(--shadow-card)]">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Bundle subtotal
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-foreground">
                              {formatNgn(fullBundle.basePrice)}
                            </p>
                            <Button
                              className="mt-4 w-full"
                              variant={selectedBundleId === fullBundle.id ? "default" : "outline"}
                              onClick={() =>
                                setSelectedBundleId((current) =>
                                  current === fullBundle.id ? undefined : fullBundle.id,
                                )
                              }
                            >
                              {selectedBundleId === fullBundle.id
                                ? "Bundle selected"
                                : "Choose full bundle"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="mt-6">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Individual schedules
                          </p>
                          <p className="text-xs text-muted-foreground">
                            If you do not need every schedule, keep only the checks you want below.
                          </p>
                        </div>
                        {selectedBundleId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedBundleId(undefined)}
                          >
                            Switch to custom selection
                          </Button>
                        )}
                      </div>
                      <DdCheckSelector
                        showInspection={false}
                        onSelectionChange={setSelectorSelection}
                      />
                    </div>
                    <div className="mt-8 flex justify-end gap-3">
                      <Button disabled={!scheduleStepValid} onClick={() => setStep("PROPERTY")}>
                        Continue to property
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </section>
                )}

                {step === "PROPERTY" && (
                  <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
                    <h2 className="text-xl font-semibold">2. Property details</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Add the property you want checked — a SafeBuyRealties listing or an
                      off-platform address.
                    </p>
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      {[
                        {
                          value: "LISTING" as const,
                          title: "On-platform listing",
                          description:
                            "Use an existing SafeBuyRealties listing ID and keep the request attached to that property record.",
                        },
                        {
                          value: "EXTERNAL" as const,
                          title: "Off-platform property",
                          description:
                            "Enter the address and any available title or seller details for a property outside the marketplace.",
                        },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setPropertySource(option.value)}
                          className={`rounded-2xl border p-5 text-left transition-colors ${
                            propertySource === option.value
                              ? "border-primary bg-primary-soft/60"
                              : "border-border/60 hover:border-border hover:bg-secondary/40"
                          }`}
                        >
                          <p className="text-base font-semibold text-foreground">{option.title}</p>
                          <p className="mt-2 text-sm text-muted-foreground">{option.description}</p>
                        </button>
                      ))}
                    </div>

                    {propertySource === "LISTING" ? (
                      <div className="mt-6 rounded-2xl border border-border/60 p-5">
                        <Label htmlFor="listingId">Listing ID</Label>
                        <Input
                          id="listingId"
                          className="mt-2"
                          value={listingId}
                          onChange={(event) => setListingId(event.target.value)}
                          placeholder="Paste a SafeBuyRealties listing ID"
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          You can copy this from a listing detail page. Need one?{" "}
                          <Link to="/browse" className="text-primary underline">
                            Browse live listings
                          </Link>
                          .
                        </p>
                        {listingLoading && listingId.trim() && (
                          <p className="mt-4 text-sm text-muted-foreground">
                            Loading listing preview…
                          </p>
                        )}
                        {listing && (
                          <div className="mt-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
                            <div className="flex items-center gap-2 text-sm text-primary">
                              <ShieldCheck className="h-4 w-4" />
                              Listing preview
                            </div>
                            <p className="mt-2 text-base font-semibold text-foreground">
                              {listing.title}
                            </p>
                            <p className="text-sm text-muted-foreground">{listing.location}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-6 grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <Label htmlFor="address">Property address</Label>
                          <Input
                            id="address"
                            className="mt-2"
                            value={externalProperty.address}
                            onChange={(event) =>
                              setExternalProperty((current) => ({
                                ...current,
                                address: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="state">State</Label>
                          <Select
                            value={externalProperty.state || undefined}
                            onValueChange={(value) =>
                              setExternalProperty((current) => ({
                                ...current,
                                state: value,
                                lga: "",
                              }))
                            }
                          >
                            <SelectTrigger id="state" className="mt-2 w-full bg-background">
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              {NIGERIA_STATES.map((state) => (
                                <SelectItem key={state} value={state}>
                                  {NIGERIA_STATE_LABELS[state]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="lga">LGA</Label>
                          <Select
                            value={externalProperty.lga || undefined}
                            onValueChange={(value) =>
                              setExternalProperty((current) => ({
                                ...current,
                                lga: value,
                              }))
                            }
                            disabled={!externalProperty.state}
                          >
                            <SelectTrigger id="lga" className="mt-2 w-full bg-background">
                              <SelectValue
                                placeholder={
                                  externalProperty.state ? "Select LGA" : "Select a state first"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              {availableLgas.map((lga) => (
                                <SelectItem key={lga} value={lga}>
                                  {lga}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="propertyType">Property type</Label>
                          <Input
                            id="propertyType"
                            className="mt-2"
                            value={externalProperty.propertyType}
                            onChange={(event) =>
                              setExternalProperty((current) => ({
                                ...current,
                                propertyType: event.target.value,
                              }))
                            }
                            placeholder="Duplex, land, apartment…"
                          />
                        </div>
                        <div>
                          <Label htmlFor="approxSize">Approximate size</Label>
                          <Input
                            id="approxSize"
                            className="mt-2"
                            value={externalProperty.approxSize}
                            onChange={(event) =>
                              setExternalProperty((current) => ({
                                ...current,
                                approxSize: event.target.value,
                              }))
                            }
                            placeholder="500 sqm, 2 plots…"
                          />
                        </div>
                        <div>
                          <Label htmlFor="titleRef">Title reference</Label>
                          <Input
                            id="titleRef"
                            className="mt-2"
                            value={externalProperty.titleRef}
                            onChange={(event) =>
                              setExternalProperty((current) => ({
                                ...current,
                                titleRef: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="sellerName">Seller name</Label>
                          <Input
                            id="sellerName"
                            className="mt-2"
                            value={externalProperty.sellerName}
                            onChange={(event) =>
                              setExternalProperty((current) => ({
                                ...current,
                                sellerName: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="sellerContact">Seller contact</Label>
                          <Input
                            id="sellerContact"
                            className="mt-2"
                            value={externalProperty.sellerContact}
                            onChange={(event) =>
                              setExternalProperty((current) => ({
                                ...current,
                                sellerContact: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="notes">Notes</Label>
                          <Textarea
                            id="notes"
                            className="mt-2"
                            rows={4}
                            value={externalProperty.notes}
                            onChange={(event) =>
                              setExternalProperty((current) => ({
                                ...current,
                                notes: event.target.value,
                              }))
                            }
                            placeholder="Known concerns, document gaps, access notes, or context for the review team."
                          />
                        </div>
                      </div>
                    )}
                    <div className="mt-8 flex justify-between gap-3">
                      <Button variant="outline" onClick={() => setStep("SCHEDULES")}>
                        Back
                      </Button>
                      <Button disabled={!propertyStepValid} onClick={() => setStep("CONTACT")}>
                        Continue to contact
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </section>
                )}

                {step === "CONTACT" && (
                  <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
                    <h2 className="text-xl font-semibold">3. Contact details</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      We use these details for payment, receipts, and staff follow-up on the case.
                    </p>
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Label htmlFor="guestName">Full name</Label>
                        <Input
                          id="guestName"
                          className="mt-2"
                          value={contact.guestName}
                          onChange={(event) =>
                            setContact((current) => ({ ...current, guestName: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="guestEmail">Email address</Label>
                        <Input
                          id="guestEmail"
                          type="email"
                          className="mt-2"
                          value={contact.guestEmail}
                          onChange={(event) =>
                            setContact((current) => ({
                              ...current,
                              guestEmail: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="guestPhone">Phone number</Label>
                        <Input
                          id="guestPhone"
                          className="mt-2"
                          value={contact.guestPhone}
                          onChange={(event) =>
                            setContact((current) => ({
                              ...current,
                              guestPhone: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-8 flex justify-between gap-3">
                      <Button variant="outline" onClick={() => setStep("PROPERTY")}>
                        Back
                      </Button>
                      <Button disabled={!isContactValid(contact)} onClick={() => setStep("REVIEW")}>
                        Continue to review
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </section>
                )}

                {step === "REVIEW" && (
                  <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
                    <h2 className="text-xl font-semibold">4. Review and pay</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Creating the order generates your service ID and case ID before Paystack
                      checkout starts.
                    </p>
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-border/60 p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Property
                        </p>
                        <p className="mt-2 font-semibold text-foreground">
                          {propertySource === "LISTING"
                            ? listing?.title || "SafeBuyRealties listing"
                            : externalProperty.propertyType || "Off-platform property"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {propertySource === "LISTING"
                            ? listing?.location || listingId
                            : [
                                externalProperty.address,
                                externalProperty.lga,
                                externalProperty.state,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/60 p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Contact
                        </p>
                        <p className="mt-2 font-semibold text-foreground">{contact.guestName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{contact.guestEmail}</p>
                        <p className="text-sm text-muted-foreground">{contact.guestPhone}</p>
                      </div>
                    </div>
                    <div className="mt-6 rounded-2xl border border-border/60 bg-muted/30 p-5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {activeSelection.bundleId
                            ? "Full due diligence bundle"
                            : "Selected schedules"}
                        </span>
                        <span className="font-medium text-foreground">
                          {activeSelection.bundleId
                            ? fullBundle?.name
                            : `${activeSelection.itemIds.length} schedule${activeSelection.itemIds.length === 1 ? "" : "s"}`}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal</span>
                          <span>{formatNgn(activeSelection.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>VAT (7.5%)</span>
                          <span>{formatNgn(activeSelection.vat)}</span>
                        </div>
                        <div className="flex justify-between text-base font-semibold text-foreground">
                          <span>Total</span>
                          <span className="text-primary">{formatNgn(activeSelection.total)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-8 flex justify-between gap-3">
                      <Button variant="outline" onClick={() => setStep("CONTACT")}>
                        Back
                      </Button>
                      <Button
                        size="lg"
                        disabled={createOrder.isPending || payOrder.isPending || !canSubmit}
                        onClick={() => void submitOrder()}
                      >
                        {createOrder.isPending || payOrder.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating order…
                          </>
                        ) : (
                          <>
                            Create order and pay {formatNgn(activeSelection.total)}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  </section>
                )}
              </div>

              <aside className="space-y-4">
                <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    What happens next
                  </p>
                  <ol className="mt-4 space-y-4 text-sm">
                    {[
                      "We open a standalone due diligence case and generate a service ID.",
                      "Payment confirms the case and places it in the staff queue.",
                      "Staff move the case to in progress, upload reports, and close with a verdict.",
                    ].map((item, index) => (
                      <li key={item} className="flex gap-3">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                          {index + 1}
                        </span>
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Current total
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">
                    {formatNgn(activeSelection.total)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    VAT included. Bundle pricing applies automatically when you choose the full
                    Schedule A-D package.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
