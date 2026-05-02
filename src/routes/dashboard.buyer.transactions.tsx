import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Clock, ArrowRight } from "lucide-react";
import { useMyTransactionsQuery, type TransactionDto } from "@/hooks/use-transactions";
import { useInitiatePaymentMutation } from "@/hooks/use-payments";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/buyer/transactions")({
  validateSearch: (search: Record<string, unknown>) => ({
    mock: search.mock === "1" || search.mock === true,
  }),
  component: () => (
    <DashboardLayout role="buyer">
      <Transactions />
    </DashboardLayout>
  ),
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

function statusBadgeClass(status: string) {
  switch (status) {
    case "COMPLETED":
      return "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]";
    case "IN_PROGRESS":
      return "border-primary/20 bg-primary-soft text-primary";
    case "INITIATED":
    default:
      return "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]";
  }
}

function statusLabel(status: string) {
  const m: Record<string, string> = {
    INITIATED: "Initiated",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
  };
  return m[status] ?? status;
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

function depositAmountForListing(priceStr: string) {
  const n = Number(priceStr);
  if (!Number.isFinite(n) || n <= 0) return 500_000;
  return Math.min(Math.max(Math.round(n * 0.02), 5_000), 2_000_000);
}

function Transactions() {
  const { mock } = Route.useSearch();
  const qc = useQueryClient();
  const { data: items, isLoading, isError, error, refetch } = useMyTransactionsQuery();

  useEffect(() => {
    if (mock) {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.message("Refreshing transactions after payment…");
    }
  }, [mock, qc]);

  const stats = useMemo(() => {
    const list = items ?? [];
    const active = list.filter((t) => t.status !== "COMPLETED").length;
    const completed = list.filter((t) => t.status === "COMPLETED").length;
    return { total: list.length, active, completed };
  }, [items]);

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Track purchases you have started on live listings. Complete payment to finish."
      />

      {isError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load transactions."}{" "}
          <button type="button" className="ml-2 underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total" value={String(stats.total)} hint="All time" />
        <StatCard label="Active" value={String(stats.active)} hint="Not completed" />
        <StatCard label="Completed" value={String(stats.completed)} />
      </div>

      <div className="mt-8 space-y-6">
        {isLoading && (
          <p className="text-center text-sm text-muted-foreground">Loading transactions…</p>
        )}
        {!isLoading && (items ?? []).length === 0 && (
          <div className="rounded-xl border border-border/60 bg-card p-10 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm text-muted-foreground">You have not started any transactions yet.</p>
            <Button className="mt-4" asChild>
              <Link to="/dashboard/buyer/listings">
                Browse listings <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
        {(items ?? []).map((tx) => (
          <TransactionCard key={tx.id} tx={tx} />
        ))}
      </div>
    </>
  );
}

function TransactionCard({ tx }: { tx: TransactionDto }) {
  const steps = timelineForStatus(tx.status);
  const amount = formatMoney(tx.listing.price, tx.listing.currency);
  const payMutation = useInitiatePaymentMutation();
  const deposit = depositAmountForListing(tx.listing.price);
  const canPay = tx.status !== "COMPLETED";

  const pay = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const callbackUrl = `${origin}/dashboard/buyer/transactions?mock=1`;
    payMutation.mutate(
      {
        amount: deposit,
        currency: tx.listing.currency || "NGN",
        transactionId: tx.id,
        callbackUrl,
      },
      {
        onSuccess: (res) => {
          if (res.authorizationUrl.includes("mock=1")) {
            toast.success("Payment completed (demo / no Paystack key). Transaction updated.");
            return;
          }
          window.location.href = res.authorizationUrl;
        },
        onError: (e) => {
          toast.error(e instanceof ApiError ? e.message : "Payment could not start.");
        },
      },
    );
  };

  return (
    <article className="rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Transaction</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{tx.listing.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx.listing.location} · <span className="font-semibold text-foreground">{amount}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`gap-1 ${statusBadgeClass(tx.status)}`}>
            {statusLabel(tx.status)}
          </Badge>
          {canPay && (
            <Button size="sm" onClick={() => pay()} disabled={payMutation.isPending}>
              {payMutation.isPending ? "Processing…" : `Pay ${formatMoney(String(deposit), tx.listing.currency)}`}
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
        <ol className="relative space-y-5 pl-6">
          <span className="absolute bottom-2 left-[9px] top-2 w-px bg-border" aria-hidden />
          {steps.map((step) => {
            const Icon = step.done ? CheckCircle2 : step.current ? Clock : Circle;
            const color = step.done ? "text-success" : step.current ? "text-primary" : "text-muted-foreground";
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
                      step.done || step.current ? "font-medium text-foreground" : "text-muted-foreground"
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
          Started {new Date(tx.createdAt).toLocaleString()} · Updated {new Date(tx.updatedAt).toLocaleString()}
        </p>
      </div>
    </article>
  );
}
