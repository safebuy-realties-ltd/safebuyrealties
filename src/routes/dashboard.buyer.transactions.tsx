import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock, CreditCard, ShieldCheck, FileSignature } from "lucide-react";

export const Route = createFileRoute("/dashboard/buyer/transactions")({
  component: () => (
    <DashboardLayout role="buyer">
      <Transactions />
    </DashboardLayout>
  ),
});

type EscrowStatus = "awaiting_funds" | "funded" | "in_review" | "released" | "completed";

type Tx = {
  id: string;
  property: string;
  amount: string;
  escrow: EscrowStatus;
  reference: string;
  timeline: { label: string; date: string; done: boolean; current?: boolean }[];
  nextAction?: { label: string; kind: "primary" | "outline" };
};

const escrowMeta: Record<EscrowStatus, { label: string; className: string }> = {
  awaiting_funds: { label: "Awaiting funds", className: "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]" },
  funded: { label: "Escrow funded", className: "border-primary/20 bg-primary-soft text-primary" },
  in_review: { label: "Under verification", className: "border-primary/20 bg-primary-soft text-primary" },
  released: { label: "Funds released", className: "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]" },
  completed: { label: "Completed", className: "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]" },
};

const transactions: Tx[] = [
  {
    id: "tx_001",
    property: "Maple Heights Apartment",
    amount: "$185,000",
    escrow: "in_review",
    reference: "SBR-2026-0418",
    nextAction: { label: "Sign final agreement", kind: "primary" },
    timeline: [
      { label: "Offer accepted", date: "Apr 12, 2026", done: true },
      { label: "Escrow funded", date: "Apr 15, 2026", done: true },
      { label: "Verification in progress", date: "Apr 22, 2026", done: true, current: true },
      { label: "Final signing", date: "Pending", done: false },
      { label: "Funds released", date: "Pending", done: false },
    ],
  },
  {
    id: "tx_002",
    property: "Garden Court Residence",
    amount: "$420,000",
    escrow: "awaiting_funds",
    reference: "SBR-2026-0429",
    nextAction: { label: "Fund escrow", kind: "primary" },
    timeline: [
      { label: "Offer submitted", date: "Apr 26, 2026", done: true },
      { label: "Offer accepted", date: "Apr 28, 2026", done: true, current: true },
      { label: "Awaiting escrow funding", date: "Pending", done: false },
      { label: "Verification", date: "Pending", done: false },
      { label: "Closing", date: "Pending", done: false },
    ],
  },
  {
    id: "tx_003",
    property: "Sunset Bay Condo",
    amount: "$510,000",
    escrow: "completed",
    reference: "SBR-2026-0301",
    timeline: [
      { label: "Offer accepted", date: "Mar 1, 2026", done: true },
      { label: "Escrow funded", date: "Mar 4, 2026", done: true },
      { label: "Verification complete", date: "Mar 19, 2026", done: true },
      { label: "Final signing", date: "Mar 24, 2026", done: true },
      { label: "Funds released", date: "Mar 26, 2026", done: true, current: true },
    ],
  },
];

function Transactions() {
  return (
    <>
      <PageHeader
        title="Transactions"
        description="Escrow status, payment actions and verification timeline."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active" value="2" hint="1 awaiting your action" />
        <StatCard label="In escrow" value="$605,000" hint="Across 2 properties" />
        <StatCard label="Completed (YTD)" value="3" />
      </div>

      <div className="mt-8 space-y-6">
        {transactions.map((tx) => (
          <article
            key={tx.id}
            className="rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]"
          >
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {tx.reference}
                </p>
                <h3 className="mt-1 text-base font-semibold text-foreground">{tx.property}</h3>
                <p className="mt-1 text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{tx.amount}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={`gap-1 ${escrowMeta[tx.escrow].className}`}>
                  <ShieldCheck className="h-3 w-3" /> {escrowMeta[tx.escrow].label}
                </Badge>
                {tx.nextAction && (
                  <Button size="sm" variant={tx.nextAction.kind === "primary" ? "default" : "outline"}>
                    {tx.nextAction.label === "Fund escrow" ? <CreditCard className="mr-1 h-4 w-4" /> : <FileSignature className="mr-1 h-4 w-4" />}
                    {tx.nextAction.label}
                  </Button>
                )}
              </div>
            </header>

            <div className="p-5">
              <ol className="relative space-y-5 pl-6">
                <span className="absolute left-[9px] top-2 bottom-2 w-px bg-border" aria-hidden />
                {tx.timeline.map((step, i) => {
                  const Icon = step.done ? CheckCircle2 : step.current ? Clock : Circle;
                  const color = step.done
                    ? "text-success"
                    : step.current
                    ? "text-primary"
                    : "text-muted-foreground";
                  return (
                    <li key={i} className="relative">
                      <span className={`absolute -left-6 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-card ${color}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={`text-sm ${step.done || step.current ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                          {step.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{step.date}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
