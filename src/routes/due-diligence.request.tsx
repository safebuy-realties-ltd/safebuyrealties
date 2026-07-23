import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import {
  DdScheduleChecklistSelector,
  type DdScheduleChecklistSelection,
} from "@/components/DdScheduleChecklistSelector";
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
import {
  isStandaloneDdSubmitted,
  useCreateStandaloneDdOrderMutation,
  useStandaloneDdOrderQuery,
} from "@/hooks/use-standalone-dd";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  DD_SCHEDULES,
  type DdChecklistSelections,
} from "@/lib/dd-schedule-checklists";
import { getLgasForState, NIGERIA_STATE_LABELS, NIGERIA_STATES } from "@/lib/nigeria-locations";
import { toast } from "sonner";

export const Route = createFileRoute("/due-diligence/request")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    listingId?: string;
    serviceId?: string;
  } => ({
    listingId: typeof search.listingId === "string" ? search.listingId : undefined,
    serviceId: typeof search.serviceId === "string" ? search.serviceId : undefined,
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

function stepLabel(step: RequestStep) {
  switch (step) {
    case "SCHEDULES":
      return "Schedules";
    case "PROPERTY":
      return "Property";
    case "CONTACT":
      return "Contact";
    case "REVIEW":
      return "Review";
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

function DueDiligenceRequestPage() {
  const { listingId: listingIdSearch, serviceId: serviceIdSearch } = Route.useSearch();
  const { user, isAuthenticated } = useAuth();
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
  const [selectionMeta, setSelectionMeta] = useState<DdScheduleChecklistSelection>({
    checklistSelections: {},
    selectedCount: 0,
    scheduleCodes: [],
  });
  const checklistSelections = selectionMeta.checklistSelections;
  const [contact, setContact] = useState<ContactForm>({
    guestName: user?.name ?? "",
    guestEmail: user?.email ?? "",
    guestPhone: "",
  });
  const [serviceId, setServiceId] = useState<string | null>(serviceIdSearch ?? null);
  const [submittedServiceId, setSubmittedServiceId] = useState<string | null>(
    serviceIdSearch ?? null,
  );

  const createOrder = useCreateStandaloneDdOrderMutation();
  const trackServiceId = submittedServiceId ?? serviceIdSearch ?? serviceId;
  const { data: submittedOrder } = useStandaloneDdOrderQuery(trackServiceId);
  const hasSubmitted = isStandaloneDdSubmitted(submittedOrder);
  const shouldResolveListing = propertySource === "LISTING" && listingId.trim().length > 0;
  const { data: listing, isLoading: listingLoading } = useListingQuery(
    shouldResolveListing ? listingId.trim() : "",
  );

  useEffect(() => {
    if (serviceIdSearch) {
      setServiceId(serviceIdSearch);
      setSubmittedServiceId(serviceIdSearch);
    }
  }, [serviceIdSearch]);

  const availableLgas = useMemo(
    () => getLgasForState(externalProperty.state),
    [externalProperty.state],
  );
  const propertyStepValid =
    propertySource === "LISTING"
      ? Boolean(listingId.trim() && listing)
      : isExternalPropertyValid(externalProperty);
  const scheduleStepValid = selectionMeta.selectedCount > 0;
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
        checklistSelections,
      });
      setServiceId(created.serviceId);
      setSubmittedServiceId(created.serviceId);
      toast.success("Request submitted. Our team will confirm pricing and next steps.");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("serviceId", created.serviceId);
        window.history.replaceState({}, "", url.toString());
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not submit the due diligence request.",
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
                  Request Schedules A–D for any property
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                  Pick the checklist items you need under each schedule. There is no payment at
                  submit — our team will quote you based on what you selected.
                </p>
              </div>
              {serviceId && (
                <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm shadow-[var(--shadow-card)]">
                  <p className="text-muted-foreground">Service ID</p>
                  <p className="mt-1 font-mono font-medium text-foreground">{serviceId}</p>
                </div>
              )}
            </div>
            {!hasSubmitted && (
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
          {isAuthenticated && user?.role !== "buyer" && !hasSubmitted && (
            <div className="mb-6 rounded-2xl border border-warning/40 bg-warning/10 px-5 py-4 text-sm text-foreground">
              You are signed in as <strong>{user?.role}</strong>. This flow supports guests or
              signed-in buyers only. Sign out or switch to a buyer account before submitting.
            </div>
          )}

          {hasSubmitted && submittedOrder ? (
            <DdOrderConfirmation
              order={submittedOrder}
              isAuthenticatedBuyer={Boolean(isAuthenticated && user?.role === "buyer")}
            />
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                {step === "SCHEDULES" && (
                  <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
                    <h2 className="text-xl font-semibold">1. Select due diligence checks</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Nothing is selected by default. Open each schedule and tick the items that
                      apply — or use Select all under that schedule.
                    </p>
                    <div className="mt-6">
                      <DdScheduleChecklistSelector
                        onChange={(next) => {
                          setSelectionMeta(next);
                        }}
                      />
                    </div>
                    <div className="sticky bottom-4 z-10 mt-8 flex justify-end gap-3 rounded-2xl border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur">
                      <Button
                        data-testid="dd-continue-property"
                        disabled={!scheduleStepValid}
                        onClick={() => setStep("PROPERTY")}
                      >
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
                          Open any listing and use <strong>Copy</strong> next to Listing ID, or
                          click <strong>Request due diligence</strong> on that page to fill this
                          automatically.{" "}
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
                      We use these details so the team can send your quote and case updates.
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
                    <h2 className="text-xl font-semibold">4. Review and submit</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Submit opens the case for staff. Pricing is confirmed afterward based on your
                      selected checks — no payment is taken here.
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
                    <div className="mt-6 space-y-4">
                      {DD_SCHEDULES.filter(
                        (schedule) => (checklistSelections[schedule.code]?.length ?? 0) > 0,
                      ).map((schedule) => (
                        <div
                          key={schedule.code}
                          className="rounded-2xl border border-border/60 bg-muted/20 p-5"
                        >
                          <p className="font-semibold text-foreground">{schedule.name}</p>
                          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                            {(checklistSelections[schedule.code] ?? []).map((code) => {
                              const item = schedule.items.find((entry) => entry.code === code);
                              return (
                                <li key={code} className="flex items-start gap-2">
                                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                  <span>{item?.label ?? code}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <div className="mt-8 flex justify-between gap-3">
                      <Button variant="outline" onClick={() => setStep("CONTACT")}>
                        Back
                      </Button>
                      <Button
                        size="lg"
                        disabled={createOrder.isPending || !canSubmit}
                        onClick={() => void submitOrder()}
                      >
                        {createOrder.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Submitting…
                          </>
                        ) : (
                          <>
                            Submit request
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
                      "You submit the request with your selected checklist items.",
                      "Staff receive the case and confirm a tailored quote.",
                      "Relevant professionals are suggested by schedule; staff assign the work.",
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
                    Selection summary
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">
                    {selectionMeta.selectedCount}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    checklist item{selectionMeta.selectedCount === 1 ? "" : "s"} across{" "}
                    {selectionMeta.scheduleCodes.length} schedule
                    {selectionMeta.scheduleCodes.length === 1 ? "" : "s"}. Pricing is confirmed by
                    the team after submit.
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
