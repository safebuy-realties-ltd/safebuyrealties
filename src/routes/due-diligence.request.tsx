import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useListingQuery } from "@/hooks/use-listings";
import { type ServiceBundle, useServiceBundlesQuery } from "@/hooks/use-service-catalog";
import {
  useCreateStandaloneDdOrderMutation,
  usePayStandaloneDdOrderMutation,
  useStandaloneDdOrderQuery,
} from "@/hooks/use-standalone-dd";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/due-diligence/request")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { listingId?: string; serviceId?: string } => ({
    listingId: typeof search.listingId === "string" ? search.listingId : undefined,
    serviceId: typeof search.serviceId === "string" ? search.serviceId : undefined,
  }),
  component: DueDiligenceRequestPage,
});

const STEPS = ["PROPERTY", "SCHEDULES", "CONTACT", "REVIEW"] as const;
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
    case "PROPERTY":
      return "Property";
    case "SCHEDULES":
      return "Schedules";
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
  return form.address.trim() && form.state.trim();
}

function fullDdBundle(bundles: ServiceBundle[] | undefined) {
  return bundles?.find((bundle) => bundle.code === "FULL_DD" || bundle.code === "FULL_DD_BUNDLE");
}

function DueDiligenceRequestPage() {
  const { listingId: listingIdSearch, serviceId: serviceIdSearch } = Route.useSearch();
  const { user, isAuthenticated } = useAuth();
  const { data: bundles } = useServiceBundlesQuery();
  const fullBundle = useMemo(() => fullDdBundle(bundles), [bundles]);
  const [step, setStep] = useState<RequestStep>("PROPERTY");
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
  const [paidServiceId, setPaidServiceId] = useState<string | null>(serviceIdSearch ?? null);

  const createOrder = useCreateStandaloneDdOrderMutation();
  const payOrder = usePayStandaloneDdOrderMutation();
  const { data: paidOrder } = useStandaloneDdOrderQuery(paidServiceId);
  const hasConfirmedPayment = Boolean(paidOrder && paidOrder.status !== "PENDING_PAYMENT");
  const shouldResolveListing = propertySource === "LISTING" && listingId.trim().length > 0;
  const { data: listing, isLoading: listingLoading } = useListingQuery(
    shouldResolveListing ? listingId.trim() : "",
  );

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

  const propertyStepValid =
    propertySource === "LISTING"
      ? Boolean(listingId.trim())
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

      if (payment.authorizationUrl.includes("mock=1")) {
        setPaidServiceId(created.serviceId);
        toast.success("Due diligence order created and paid in demo mode.");
        return;
      }

      if (typeof window !== "undefined") {
        window.location.href = payment.authorizationUrl;
      }
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
                  Choose an on-platform listing or enter an off-platform property, select the checks
                  you need, and pay to open a due diligence case.
                </p>
              </div>
              {serviceId && (
                <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm shadow-[var(--shadow-card)]">
                  <p className="text-muted-foreground">Service ID</p>
                  <p className="mt-1 font-mono font-medium text-foreground">{serviceId}</p>
                </div>
              )}
            </div>
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
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-10">
          {isAuthenticated && user?.role !== "buyer" && (
            <div className="mb-6 rounded-2xl border border-warning/40 bg-warning/10 px-5 py-4 text-sm text-foreground">
              You are signed in as <strong>{user?.role}</strong>. This flow supports guests or
              signed-in buyers only. Sign out or switch to a buyer account before paying.
            </div>
          )}

          {hasConfirmedPayment && paidOrder ? (
            <div className="rounded-3xl border border-border/60 bg-card p-8 shadow-[var(--shadow-elegant)]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold">Payment confirmed</h2>
                  <p className="text-sm text-muted-foreground">
                    Your standalone due diligence case is open and ready for staff review.
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <SummaryTile label="Service ID" value={paidOrder.serviceId} mono />
                <SummaryTile label="Case ID" value={paidOrder.caseId} mono />
                <SummaryTile label="Status" value={paidOrder.status.replace(/_/g, " ")} />
              </div>
              <div className="mt-6 rounded-2xl border border-border/60 bg-muted/30 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Property
                </p>
                <p className="mt-2 text-base font-medium text-foreground">
                  {paidOrder.property?.title ?? "Standalone property due diligence"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{paidOrder.property?.location}</p>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {isAuthenticated && user?.role === "buyer" ? (
                  <Button asChild>
                    <Link to="/dashboard/buyer/due-diligence">
                      View my cases
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/login">Sign in to track this case</Link>
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link to="/due-diligence">Start another request</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                {step === "PROPERTY" && (
                  <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
                    <h2 className="text-xl font-semibold">1. Choose the property source</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      You can request due diligence for a SafeBuyRealties listing or for a property
                      not yet listed on the platform.
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
                          <Input
                            id="state"
                            className="mt-2"
                            value={externalProperty.state}
                            onChange={(event) =>
                              setExternalProperty((current) => ({
                                ...current,
                                state: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="lga">LGA</Label>
                          <Input
                            id="lga"
                            className="mt-2"
                            value={externalProperty.lga}
                            onChange={(event) =>
                              setExternalProperty((current) => ({
                                ...current,
                                lga: event.target.value,
                              }))
                            }
                          />
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
                    <div className="mt-8 flex justify-end">
                      <Button disabled={!propertyStepValid} onClick={() => setStep("SCHEDULES")}>
                        Continue to schedules
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </section>
                )}

                {step === "SCHEDULES" && (
                  <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
                    <h2 className="text-xl font-semibold">2. Select the due diligence schedules</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Take the full Schedule A-D bundle or uncheck any individual schedule to create
                      an a la carte order.
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
                                  {item.name}
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
                    <div className="mt-8 flex justify-between gap-3">
                      <Button variant="outline" onClick={() => setStep("PROPERTY")}>
                        Back
                      </Button>
                      <Button disabled={!scheduleStepValid} onClick={() => setStep("CONTACT")}>
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
                      <Button variant="outline" onClick={() => setStep("SCHEDULES")}>
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

function SummaryTile({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}
