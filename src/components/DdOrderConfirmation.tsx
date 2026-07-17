import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Copy, Download, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StandaloneDdOrderDto } from "@/hooks/use-standalone-dd";
import { toast } from "sonner";

function formatNgn(amount: string | number, currency = "NGN") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function buildReceiptText(order: StandaloneDdOrderDto) {
  const services =
    order.services && order.services.length > 0
      ? order.services
      : order.itemIds.map((id) => String(id));
  const lines = [
    "SafeBuyRealties — Due Diligence Payment Confirmation",
    "====================================================",
    "",
    `Service ID: ${order.serviceId}`,
    `Case ID: ${order.caseId}`,
    `Status: ${formatStatus(order.status)}`,
    `Payment reference: ${order.paymentReference ?? "—"}`,
    `Transaction ID: ${order.transactionPublicId ?? order.transactionId ?? "—"}`,
    "",
    "Client",
    `  Name: ${order.guestName}`,
    `  Email: ${order.guestEmail}`,
    `  Phone: ${order.guestPhone}`,
    "",
    "Property",
    `  ${order.property?.title ?? "Standalone property due diligence"}`,
    `  ${order.property?.location ?? "Location unavailable"}`,
    "",
    "Services requested",
    ...services.map((service) => `  - ${service}`),
    "",
    "Amounts",
    `  Subtotal: ${formatNgn(order.subtotal, order.currency)}`,
    `  VAT: ${formatNgn(order.vatAmount, order.currency)}`,
    `  Total paid: ${formatNgn(order.total, order.currency)}`,
    "",
    "IMPORTANT — Keep your Service ID",
    "Use this Service ID on /due-diligence to look up your case anytime",
    "without creating an account. A confirmation email was also sent to",
    `${order.guestEmail}.`,
    "",
    `Generated: ${new Date().toISOString()}`,
  ];
  return lines.join("\n");
}

function downloadReceipt(order: StandaloneDdOrderDto) {
  const blob = new Blob([buildReceiptText(order)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `safebuy-dd-receipt-${order.serviceId}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function DdOrderConfirmation({
  order,
  isAuthenticatedBuyer = false,
}: {
  order: StandaloneDdOrderDto;
  isAuthenticatedBuyer?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const services =
    order.services && order.services.length > 0
      ? order.services
      : order.itemIds.map((id) => String(id));

  const copyServiceId = async () => {
    try {
      await navigator.clipboard.writeText(order.serviceId);
      setCopied(true);
      toast.success("Service ID copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy Service ID. Please copy it manually.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/60 bg-card p-8 shadow-[var(--shadow-elegant)]">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Payment confirmed</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your standalone due diligence case is open. SafeBuy staff have been notified and will
              progress the checks you requested.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-primary/30 bg-primary-soft/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Keep this Service ID
          </p>
          <p className="mt-2 text-sm text-foreground">
            This is your reference for looking up the case later — no login required. Copy it now,
            download the receipt, and check your email ({order.guestEmail}).
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 rounded-xl border border-primary/20 bg-background px-4 py-3 font-mono text-sm font-semibold text-foreground">
              {order.serviceId}
            </code>
            <Button type="button" variant="outline" onClick={() => void copyServiceId()}>
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copied" : "Copy Service ID"}
            </Button>
            <Button type="button" onClick={() => downloadReceipt(order)}>
              <Download className="mr-2 h-4 w-4" />
              Download receipt
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <DetailTile label="Case ID" value={order.caseId} mono />
          <DetailTile label="Status" value={formatStatus(order.status)} />
          <DetailTile
            label="Total paid"
            value={formatNgn(order.total, order.currency)}
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-border/60 bg-muted/30 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Property
            </p>
            <p className="mt-2 text-base font-medium text-foreground">
              {order.property?.title ?? "Standalone property due diligence"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.property?.location ?? "Location unavailable"}
            </p>
            {order.externalProperty?.propertyType && (
              <p className="mt-2 text-sm text-muted-foreground">
                Type: {order.externalProperty.propertyType}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border/60 bg-muted/30 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Client
            </p>
            <p className="mt-2 text-base font-medium text-foreground">{order.guestName}</p>
            <p className="mt-1 text-sm text-muted-foreground">{order.guestEmail}</p>
            <p className="mt-1 text-sm text-muted-foreground">{order.guestPhone}</p>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-border/60 bg-muted/30 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Services requested
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {services.map((service) => (
              <li key={service}>
                <Badge variant="outline" className="bg-background">
                  {service}
                </Badge>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            <p>Subtotal: {formatNgn(order.subtotal, order.currency)}</p>
            <p>VAT: {formatNgn(order.vatAmount, order.currency)}</p>
            <p className="font-medium text-foreground">
              Total: {formatNgn(order.total, order.currency)}
            </p>
          </div>
        </section>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            A confirmation email with this Service ID and receipt details was sent to{" "}
            <strong className="text-foreground">{order.guestEmail}</strong>. Keep the downloaded
            receipt as a backup in case the email is delayed or filtered.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/due-diligence/request" search={{ serviceId: order.serviceId }}>
              View this case again
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/due-diligence">Look up later on Due Diligence</Link>
          </Button>
          {isAuthenticatedBuyer ? (
            <Button variant="outline" asChild>
              <Link to="/dashboard/buyer/due-diligence">Open buyer dashboard</Link>
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/login">Sign in after activation email</Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/due-diligence/request">Start another request</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailTile({
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
