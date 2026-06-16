import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  ClipboardCopy,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { DdCheckSelector, type DdCheckSelection } from "@/components/DdCheckSelector";
import { useListingQuery } from "@/hooks/use-listings";
import { ApiError } from "@/lib/api";
import { listingIsPubliclyViewable } from "@/lib/listing-status";
import {
  useCreateGuestOrderMutation,
  useGuestCheckoutOrderQuery,
  usePayGuestOrderMutation,
  type GuestCheckoutOrderDto,
} from "@/hooks/use-guest-checkout";
import { openPaystackCheckout } from "@/lib/paystack";
import { toast } from "sonner";

type CheckoutSearch = {
  inspection?: boolean;
};

export const Route = createFileRoute("/checkout/$listingId")({
  component: GuestCheckoutPage,
  validateSearch: (search: Record<string, unknown>): CheckoutSearch => ({
    inspection: search.inspection === "1" || search.inspection === true,
  }),
});

const STEPS = ["SERVICE_SELECTION", "ORDER_SUMMARY", "PAYMENT", "SUCCESS"] as const;
type Step = (typeof STEPS)[number];

function formatNgn(amount: number | string) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return `₦${amount}`;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
}

function stepIndex(step: Step) {
  return STEPS.indexOf(step);
}

function stepProgress(step: Step) {
  const idx = stepIndex(step);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / STEPS.length) * 100);
}

function stepLabel(step: Step) {
  switch (step) {
    case "SERVICE_SELECTION":
      return "Select services";
    case "ORDER_SUMMARY":
      return "Order summary";
    case "PAYMENT":
      return "Payment";
    case "SUCCESS":
      return "Complete";
  }
}

type GuestContact = {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
};

function GuestCheckoutPage() {
  const { listingId } = Route.useParams();
  const { inspection: preselectInspection } = Route.useSearch();
  const { data: listing, isLoading, isError, error } = useListingQuery(listingId);

  const [step, setStep] = useState<Step>("SERVICE_SELECTION");
  const [selection, setSelection] = useState<DdCheckSelection | null>(null);
  const [includeInspection, setIncludeInspection] = useState(preselectInspection);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [order, setOrder] = useState<GuestCheckoutOrderDto | null>(null);
  const [contact, setContact] = useState<GuestContact>({
    guestName: "",
    guestEmail: "",
    guestPhone: "",
  });

  const createOrder = useCreateGuestOrderMutation();
  const payOrder = usePayGuestOrderMutation();
  const { data: refreshedOrder } = useGuestCheckoutOrderQuery(
    step === "SUCCESS" ? serviceId : null,
  );

  useEffect(() => {
    if (preselectInspection) setIncludeInspection(true);
  }, [preselectInspection]);

  const handleSelectionChange = useCallback((value: DdCheckSelection) => {
    setSelection(value);
  }, []);

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
            <Link to="/browse">Browse properties</Link>
          </Button>
        </main>
      </div>
    );
  }

  if (
    !listingIsPubliclyViewable(listing.status, listing.isPublished) ||
    listing.status === "UNDER_OFFER"
  ) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Checkout unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {listing.status === "UNDER_OFFER"
              ? "This property is currently under offer."
              : "Due diligence can only be started on live, published listings."}
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

  const currentStepNum = stepIndex(step) + 1;
  const successOrder = refreshedOrder ?? order;

  const proceedToSummary = async () => {
    if (!selection || selection.itemIds.length === 0) {
      toast.error("Select at least one due diligence check.");
      return;
    }
    try {
      const created = await createOrder.mutateAsync({
        listingId,
        itemIds: selection.itemIds,
        includeInspection: selection.includeInspection,
      });
      setServiceId(created.serviceId);
      setOrder(created);
      setStep("ORDER_SUMMARY");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create order.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/listings/$listingId" params={{ listingId }}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to listing
            </Link>
          </Button>
          {step !== "SUCCESS" && (
            <p className="text-sm text-muted-foreground">
              Step {currentStepNum} of {STEPS.length}: {stepLabel(step)}
            </p>
          )}
        </div>

        {step !== "SUCCESS" && (
          <div className="mb-8">
            <Progress value={stepProgress(step)} className="h-2" />
          </div>
        )}

        <div className="mb-6 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">{listing.title}</p>
          <p className="text-muted-foreground">{listing.location}</p>
        </div>

        {step === "SERVICE_SELECTION" && (
          <section className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">Select due diligence services</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose official checks performed by licensed professionals. VAT (7.5%) is included
                in the total.
              </p>
            </div>
            <DdCheckSelector
              includeInspection={includeInspection}
              onIncludeInspectionChange={setIncludeInspection}
              onSelectionChange={handleSelectionChange}
            />
            <Button
              className="w-full"
              size="lg"
              disabled={!selection || selection.itemIds.length === 0 || createOrder.isPending}
              onClick={() => void proceedToSummary()}
            >
              {createOrder.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating order…
                </>
              ) : (
                <>
                  Continue to summary
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </section>
        )}

        {step === "ORDER_SUMMARY" && order && (
          <OrderSummaryPanel
            order={order}
            onBack={() => setStep("SERVICE_SELECTION")}
            onContinue={() => setStep("PAYMENT")}
          />
        )}

        {step === "PAYMENT" && order && serviceId && (
          <PaymentPanel
            listingId={listingId}
            listingTitle={listing.title}
            serviceId={serviceId}
            order={order}
            contact={contact}
            onContactChange={setContact}
            onBack={() => setStep("ORDER_SUMMARY")}
            onPaid={(updated) => {
              setOrder(updated);
              setStep("SUCCESS");
            }}
            payOrder={payOrder}
          />
        )}

        {step === "SUCCESS" && successOrder && (
          <SuccessPanel order={successOrder} listingTitle={listing.title} />
        )}
      </main>
    </div>
  );
}

function OrderSummaryPanel({
  order,
  onBack,
  onContinue,
}: {
  order: GuestCheckoutOrderDto;
  onBack: () => void;
  onContinue: () => void;
}) {
  const copyServiceId = () => {
    void navigator.clipboard.writeText(order.serviceId);
    toast.success("Service ID copied");
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-xl font-semibold">Order summary</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Review your selection. Your Service ID is created — save it for payment and tracking.
      </p>

      <div className="mt-5 rounded-lg border border-primary/20 bg-primary-soft/40 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Service ID
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="font-mono text-sm font-semibold text-foreground">{order.serviceId}</p>
          <Button type="button" variant="ghost" size="sm" onClick={copyServiceId}>
            <ClipboardCopy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ul className="mt-5 space-y-2 border-y border-border/60 py-4">
        {order.services.map((line) => (
          <li key={line.code} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{line.name}</span>
            <span className="font-medium">{formatNgn(line.price)}</span>
          </li>
        ))}
        {order.includeInspection && (
          <li className="flex justify-between text-sm">
            <span className="text-muted-foreground">Physical inspection</span>
            <span className="font-medium">Included</span>
          </li>
        )}
      </ul>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatNgn(order.subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>VAT</span>
          <span>{formatNgn(order.vatAmount)}</span>
        </div>
        <div className="flex justify-between text-base font-bold">
          <span>Total</span>
          <span className="text-primary">{formatNgn(order.total)}</span>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" size="lg" onClick={onContinue}>
          Continue to payment
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

function PaymentPanel({
  listingId,
  listingTitle,
  serviceId,
  order,
  contact,
  onContactChange,
  onBack,
  onPaid,
  payOrder,
}: {
  listingId: string;
  listingTitle: string;
  serviceId: string;
  order: GuestCheckoutOrderDto;
  contact: GuestContact;
  onContactChange: (value: GuestContact) => void;
  onBack: () => void;
  onPaid: (order: GuestCheckoutOrderDto) => void;
  payOrder: ReturnType<typeof usePayGuestOrderMutation>;
}) {
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const contactComplete =
    contact.guestName.trim().length > 0 &&
    contact.guestEmail.trim().length > 0 &&
    contact.guestPhone.trim().length > 0;

  const startPayment = () => {
    if (!contactComplete) {
      toast.error("Enter your name, email, and phone number.");
      return;
    }
    setPaymentError(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const callbackUrl = `${origin}/checkout/${listingId}`;

    payOrder.mutate(
      {
        serviceId,
        body: {
          guestName: contact.guestName.trim(),
          guestEmail: contact.guestEmail.trim(),
          guestPhone: contact.guestPhone.trim(),
          callbackUrl,
        },
      },
      {
        onSuccess: (res) => {
          if (res.authorizationUrl.includes("mock=1") || !res.accessCode) {
            toast.success("Payment completed (demo mode).");
            onPaid({
              ...order,
              guestName: contact.guestName,
              guestEmail: contact.guestEmail,
              guestPhone: contact.guestPhone,
              transactionNumber: res.reference,
              paidAt: new Date().toISOString(),
              status: "PAID",
            });
            return;
          }

          void openPaystackCheckout({
            accessCode: res.accessCode,
            onSuccess: () => {
              toast.success("Payment confirmed.");
              onPaid({
                ...order,
                guestName: contact.guestName,
                guestEmail: contact.guestEmail,
                guestPhone: contact.guestPhone,
                transactionNumber: res.reference,
                paidAt: new Date().toISOString(),
                status: "PAID",
              });
            },
            onCancel: () => toast.message("Payment window closed."),
            onError: (err) => setPaymentError(err.message || "Payment failed."),
          });
        },
        onError: (e) => {
          setPaymentError(e instanceof ApiError ? e.message : "Payment could not start.");
        },
      },
    );
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-xl font-semibold">Payment</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your contact details and pay for due diligence on{" "}
        <span className="font-medium">{listingTitle}</span>.
      </p>

      <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
        <p className="text-xs text-muted-foreground">Service ID</p>
        <p className="font-mono font-medium">{order.serviceId}</p>
      </div>

      <div className="mt-6 grid gap-4">
        <div>
          <Label htmlFor="guestName">Full name</Label>
          <Input
            id="guestName"
            className="mt-1.5"
            value={contact.guestName}
            onChange={(e) => onContactChange({ ...contact, guestName: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="guestEmail">Email address</Label>
          <Input
            id="guestEmail"
            type="email"
            className="mt-1.5"
            value={contact.guestEmail}
            onChange={(e) => onContactChange({ ...contact, guestEmail: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="guestPhone">Phone number</Label>
          <Input
            id="guestPhone"
            type="tel"
            className="mt-1.5"
            value={contact.guestPhone}
            onChange={(e) => onContactChange({ ...contact, guestPhone: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-muted/50 p-5">
        <p className="text-sm text-muted-foreground">Amount due</p>
        <p className="mt-1 text-3xl font-bold text-primary">{formatNgn(order.total)}</p>
      </div>

      {paymentError && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {paymentError}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" onClick={onBack} disabled={payOrder.isPending}>
          Back
        </Button>
        <Button
          className="flex-1"
          size="lg"
          disabled={!contactComplete || payOrder.isPending}
          onClick={() => startPayment()}
        >
          {payOrder.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting checkout…
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay {formatNgn(order.total)}
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

function SuccessPanel({
  order,
  listingTitle,
}: {
  order: GuestCheckoutOrderDto;
  listingTitle: string;
}) {
  const paidDate = order.paidAt ? new Date(order.paidAt).toLocaleString() : "—";

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-8 shadow-[var(--shadow-card)]">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold">Payment successful</h2>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          Thank you. Our team will begin official checks on {listingTitle}. Check your email for
          account activation instructions.
        </p>
      </div>

      <dl className="mt-8 space-y-3 rounded-xl border border-border/60 bg-muted/20 p-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Service ID</dt>
          <dd className="font-mono font-medium text-right">{order.serviceId}</dd>
        </div>
        {order.transactionNumber && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Transaction number</dt>
            <dd className="font-mono font-medium text-right">{order.transactionNumber}</dd>
          </div>
        )}
        {order.caseId && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Case ID</dt>
            <dd className="font-mono font-medium text-right">{order.caseId}</dd>
          </div>
        )}
        {order.buyerId && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Buyer ID</dt>
            <dd className="font-mono font-medium text-right">{order.buyerId}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Property</dt>
          <dd className="text-right font-medium">
            {order.listingTitle ?? listingTitle}
            {order.listingLocation ? ` · ${order.listingLocation}` : ""}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Services</dt>
          <dd className="text-right">
            {order.services.map((s) => s.name).join(", ")}
            {order.includeInspection ? ", Physical inspection" : ""}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Total paid</dt>
          <dd className="font-semibold text-primary">{formatNgn(order.total)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Payment date</dt>
          <dd className="text-right">{paidDate}</dd>
        </div>
      </dl>

      <Button asChild className="mt-8 w-full" size="lg">
        <Link to="/listings/$listingId" params={{ listingId: order.listingId }}>
          Back to property
        </Link>
      </Button>
    </section>
  );
}
