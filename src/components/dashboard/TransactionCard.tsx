import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Clock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type TransactionDto } from "@/hooks/use-transactions";
import {
  useInitiatePaymentMutation,
  useVerifyPaymentMutation,
  useStartPurchaseMutation,
  useAbandonPaymentMutation,
  type InitiatePaymentResult,
} from "@/hooks/use-payments";
import { useEscrowQuery, escrowStatusLabel } from "@/hooks/use-escrow";
import { openPaystackCheckout } from "@/lib/paystack";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { KYC_REQUIRED_CODE, KYC_SCREEN_PATH, kycGateSearch } from "@/lib/kyc-gate";

/**
 * One transaction on the buyer's dashboard: where it has got to, what may be paid next, and what
 * the escrow behind it is holding.
 *
 * E1-S4 lifted this out of the route file so it could be rendered in a test. Route files in this
 * repo export nothing but their `Route`, and a card that decides whether a buyer may spend the
 * price of a house is not something to leave untested on that technicality.
 */
export function formatMoney(amount: string, currency: string) {
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

function statusBadgeClass(status: string) {
  switch (status) {
    case "COMPLETED":
    case "DD_COMPLETE":
      return "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]";
    case "IN_PROGRESS":
    case "DD_PURCHASED":
    case "DD_IN_PROGRESS":
    case "PURCHASE_IN_ESCROW":
      return "border-primary/20 bg-primary-soft text-primary";
    case "INITIATED":
    case "PURCHASE_PENDING":
    default:
      return "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]";
  }
}

function statusLabel(status: string) {
  const m: Record<string, string> = {
    INITIATED: "Initiated",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    DD_PURCHASED: "Due Diligence Purchased",
    DD_IN_PROGRESS: "Due Diligence In Progress",
    DD_COMPLETE: "Due Diligence Complete",
    PURCHASE_PENDING: "Purchase Pending",
    PURCHASE_IN_ESCROW: "Purchase In Escrow",
  };
  return m[status] ?? status;
}

function paymentIntentLabel(intent: string | undefined) {
  return intent === "PROPERTY_PURCHASE" ? "Property Purchase Payment" : "Due Diligence Payment";
}

function timelineForStatus(status: string) {
  return [
    { key: "init", label: "Initiated", done: true, current: status === "INITIATED" },
    {
      key: "prog",
      label: "In progress",
      done: status === "IN_PROGRESS" || status === "COMPLETED",
      current: status === "IN_PROGRESS",
    },
    { key: "done", label: "Completed", done: status === "COMPLETED", current: false },
  ];
}

function timelineForPaymentStatus(status: string) {
  if (status === "FAILED") {
    return [
      { key: "init", label: "Escrow initiated", done: true, current: false },
      { key: "failed", label: "Payment failed", done: false, current: true },
      { key: "done", label: "Escrow funded", done: false, current: false },
    ];
  }
  return [
    { key: "init", label: "Escrow initiated", done: true, current: status === "PENDING" },
    {
      key: "prog",
      label: "Payment processing",
      done: status === "PROCESSING" || status === "SUCCEEDED",
      current: status === "PROCESSING",
    },
    { key: "done", label: "Escrow funded", done: status === "SUCCEEDED", current: false },
  ];
}

/**
 * The statuses at which due diligence is still the thing being paid for.
 *
 * This is not the purchase rule. E1-S4 moved that one to the server and it arrives on `tx.purchase`,
 * so the browser no longer decides it. This list only decides whether to keep offering the older due
 * diligence checkout, which the story left where it was.
 */
const DD_PAYMENT_STATUSES = new Set(["INITIATED", "IN_PROGRESS", "DD_PURCHASED", "DD_IN_PROGRESS"]);

/**
 * The refusals worth putting in front of the buyer.
 *
 * `VERDICT_AGAINST` is the story's sixth criterion: a purchase blocked by due diligence has to say
 * so, rather than quietly not drawing a button. `KYC_REQUIRED` is here because it is the other
 * refusal the buyer can act on. The rest are not. A feature that is switched off should not announce
 * itself, and unfinished due diligence, money already in escrow and a transaction that has closed
 * are all things the status badge and the escrow panel on this card already say.
 */
const SHOWN_PURCHASE_BLOCKS = new Set(["VERDICT_AGAINST", KYC_REQUIRED_CODE]);

export function depositAmountForListing(priceStr: string) {
  const n = Number(priceStr);
  if (!Number.isFinite(n) || n <= 0) return 500_000;
  return Math.min(Math.max(Math.round(n * 0.02), 5_000), 2_000_000);
}

export function TransactionCard({ tx }: { tx: TransactionDto }) {
  // The payment behind a transaction now travels with the transaction. It used to be kept in
  // localStorage, so a buyer who cleared their browser lost the link to money they had already paid.
  const latestPayment = tx.latestPayment;
  const { data: escrow } = useEscrowQuery(
    tx.id,
    latestPayment?.intent === "PROPERTY_PURCHASE" ||
      tx.status === "PURCHASE_IN_ESCROW" ||
      tx.status === "COMPLETED",
  );
  const steps = latestPayment
    ? timelineForPaymentStatus(latestPayment.status)
    : timelineForStatus(tx.status);
  const amount = formatMoney(tx.listing.price, tx.listing.currency);
  const payMutation = useInitiatePaymentMutation();
  const purchaseMutation = useStartPurchaseMutation();
  const verifyMutation = useVerifyPaymentMutation();
  const abandonMutation = useAbandonPaymentMutation();
  const deposit = depositAmountForListing(tx.listing.price);
  const canPayDeposit = DD_PAYMENT_STATUSES.has(tx.status);
  const busy = payMutation.isPending || purchaseMutation.isPending;
  const refusal =
    tx.purchase.blockedBy && SHOWN_PURCHASE_BLOCKS.has(tx.purchase.blockedBy)
      ? tx.purchase.reason
      : null;
  /**
   * E4-S2. Of the two refusals this card shows, one is the buyer's to fix. A verdict against the
   * property is the end of the road, but an unverified identity is a screen away, so that one gets
   * the way to it rather than only the bad news.
   */
  const kycBlocked = tx.purchase.blockedBy === KYC_REQUIRED_CODE;

  const callbackUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/dashboard/buyer/transactions?mock=1`;
  };

  /**
   * The buyer dismissed the checkout window.
   *
   * Paystack tells nobody when that happens, so for a purchase the server has to be told, or the
   * transaction sits at PURCHASE_PENDING with no money behind it and no button to try again.
   */
  const checkoutClosed = (paymentId: string, isPurchase: boolean) => {
    if (!isPurchase) {
      toast.message("Payment window closed.");
      return;
    }
    abandonMutation.mutate(paymentId, {
      onSuccess: () => toast.message("Payment window closed. You can start the purchase again."),
      onError: () => toast.message("Payment window closed."),
    });
  };

  /** What both checkouts do once the server has opened one. */
  const openCheckout = (res: InitiatePaymentResult, isPurchase: boolean) => {
    // Mock mode (no Paystack key): backend already auto-applied success.
    if (res.authorizationUrl.includes("mock=1") || !res.accessCode) {
      toast.success("Payment completed (demo / no Paystack key). Transaction updated.");
      return;
    }
    // Real Paystack: open the inline popup, then verify server-side on success.
    void openPaystackCheckout({
      accessCode: res.accessCode,
      onSuccess: () => {
        verifyMutation.mutate(res.paymentId, {
          onSuccess: () => toast.success("Payment confirmed. Transaction updated."),
          onError: () => toast.message("Payment received, confirming shortly. Refresh if needed."),
        });
      },
      onCancel: () => checkoutClosed(res.paymentId, isPurchase),
      onError: (err) => toast.error(err.message || "Payment failed."),
    });
  };

  const payForDueDiligence = () => {
    payMutation.mutate(
      {
        amount: deposit,
        currency: tx.listing.currency || "NGN",
        transactionId: tx.id,
        callbackUrl: callbackUrl(),
        intent: "DD_SERVICE",
      },
      {
        onSuccess: (res) => openCheckout(res, false),
        onError: (e) => {
          toast.error(e instanceof ApiError ? e.message : "Payment could not start.");
        },
      },
    );
  };

  /**
   * No amount is sent. The server reads the full price off the listing, which is the only way the
   * sum held in escrow can be trusted to be the price of the property rather than whatever a browser
   * asked for.
   */
  const startPurchase = () => {
    purchaseMutation.mutate(
      { transactionId: tx.id, callbackUrl: callbackUrl() },
      {
        onSuccess: (res) => openCheckout(res, true),
        onError: (e) => {
          toast.error(e instanceof ApiError ? e.message : "The purchase could not be started.");
        },
      },
    );
  };

  return (
    <article className="rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Transaction
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{tx.listing.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx.listing.location} · <span className="font-semibold text-foreground">{amount}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border/60 bg-muted text-muted-foreground">
            {paymentIntentLabel(latestPayment?.intent)}
          </Badge>
          <Badge variant="outline" className={`gap-1 ${statusBadgeClass(tx.status)}`}>
            {statusLabel(tx.status)}
          </Badge>
          {canPayDeposit && (
            <Button size="sm" onClick={() => payForDueDiligence()} disabled={busy}>
              {payMutation.isPending
                ? "Processing…"
                : `Pay ${formatMoney(String(deposit), tx.listing.currency)}`}
            </Button>
          )}
          {/* Drawn from the server's answer, never from the status on this row. */}
          {tx.purchase.canPurchase && (
            <Button size="sm" onClick={() => startPurchase()} disabled={busy}>
              {purchaseMutation.isPending
                ? "Processing…"
                : `Purchase ${formatMoney(tx.listing.price, tx.listing.currency)}`}
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/listings/$listingId" params={{ listingId: tx.listing.id }}>
              View listing
            </Link>
          </Button>
        </div>
      </header>

      <div className="p-5">
        {refusal && (
          <div
            data-testid="purchase-blocked"
            className="mb-5 space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"
          >
            <p className="text-sm text-destructive">{refusal}</p>
            {kycBlocked && (
              <Link
                to={KYC_SCREEN_PATH}
                search={kycGateSearch("/dashboard/buyer/transactions")}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Verify your identity
              </Link>
            )}
          </div>
        )}
        {tx.purchase.caution && (
          <p
            data-testid="purchase-caution"
            className="mb-5 rounded-lg border border-warning/30 bg-warning/15 px-4 py-3 text-sm text-[oklch(0.45_0.13_75)]"
          >
            {tx.purchase.caution}
          </p>
        )}
        <ol className="relative space-y-5 pl-6">
          <span className="absolute bottom-2 left-[9px] top-2 w-px bg-border" aria-hidden />
          {steps.map((step) => {
            const Icon = step.done ? CheckCircle2 : step.current ? Clock : Circle;
            const color = step.done
              ? "text-success"
              : step.current
                ? "text-primary"
                : "text-muted-foreground";
            return (
              <li key={step.key} className="relative">
                <span
                  className={`absolute -left-6 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-card ${color}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p
                    className={`text-sm ${
                      step.done || step.current
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Started {new Date(tx.createdAt).toLocaleString()} · Updated{" "}
          {new Date(tx.updatedAt).toLocaleString()}
        </p>
        {latestPayment?.reference && (
          <p className="mt-1 text-xs text-muted-foreground">
            Payment reference: <span className="font-mono">{latestPayment.reference}</span>
          </p>
        )}
        {escrow && (
          <div data-testid="escrow-panel" className="mt-6 rounded-lg border p-4">
            <h4 className="text-sm font-semibold">Escrow</h4>
            <p className="text-sm">
              {escrowStatusLabel(escrow.status)} ·{" "}
              {formatMoney(escrow.heldAmount, tx.listing.currency)} held
            </p>
            {escrow.releasedAt && (
              <p className="text-xs text-muted-foreground">
                Released {new Date(escrow.releasedAt).toLocaleString()}
              </p>
            )}
            {/* What is still standing between the buyer and their money moving. */}
            {escrow.unmetConditions.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Still outstanding before release
                </p>
                <ul className="mt-2 space-y-1">
                  {escrow.unmetConditions.map((condition) => (
                    <li
                      key={condition.code}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Circle className="mt-1 h-3 w-3 shrink-0" aria-hidden />
                      <span>{condition.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                Every release condition has been met.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
