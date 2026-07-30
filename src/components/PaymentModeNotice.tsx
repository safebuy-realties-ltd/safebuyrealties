import { AlertTriangle, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PayoutDto } from "@/hooks/use-escrow";

/**
 * Operator-facing signals for mock payment mode.
 *
 * In mock mode the API records payments as succeeded and payouts as COMPLETED without
 * contacting Paystack. Nothing about the resulting record looks unusual, so an operator
 * has to be told. See backend/src/config/payments-guard.ts and
 * docs/adr/0003-payment-mock-mode-guard.md.
 */

/** Per-record marker. Render wherever a payment or payout is shown to an operator. */
export function MockPaymentBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={`gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 ${className ?? ""}`}
    >
      <FlaskConical className="h-3 w-3" aria-hidden />
      Mock — no money moved
    </Badge>
  );
}

/** Page-level warning, shown before an operator acts on money. */
export function MockPaymentModeBanner() {
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <div>
        <p className="font-medium text-amber-800 dark:text-amber-300">Payments are in mock mode</p>
        <p className="mt-1 text-muted-foreground">
          No Paystack credentials are configured, so releasing an escrow records a completed payout
          without transferring any funds. Sellers will not be paid.
        </p>
      </div>
    </div>
  );
}

/** The payout produced by a release, with its mock status made explicit. */
export function PayoutSummary({ payout }: { payout: PayoutDto }) {
  return (
    <div className="mb-4 rounded-lg border p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">Payout {payout.status.toLowerCase()}</p>
        {payout.isMock && <MockPaymentBadge />}
      </div>
      <dl className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
        <div className="flex gap-2">
          <dt>Net to seller</dt>
          <dd className="font-medium text-foreground">₦{payout.netAmount}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Platform fee</dt>
          <dd className="font-medium text-foreground">₦{payout.platformFee}</dd>
        </div>
        {payout.gatewayReference && (
          <div className="flex gap-2 sm:col-span-2">
            <dt>Reference</dt>
            <dd className="break-all font-mono text-xs text-foreground">
              {payout.gatewayReference}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
