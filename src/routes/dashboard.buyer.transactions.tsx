import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useMyTransactionsQuery } from "@/hooks/use-transactions";
import { TransactionCard } from "@/components/dashboard/TransactionCard";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMyInspectionsQuery } from "@/hooks/use-inspections";

export const Route = createFileRoute("/dashboard/buyer/transactions")({
  validateSearch: (search: Record<string, unknown>): { mock?: boolean } => ({
    mock: search.mock === "1" || search.mock === true ? true : undefined,
  }),
  component: Transactions,
});

function Transactions() {
  const { mock } = Route.useSearch();
  const qc = useQueryClient();
  const { data: items, isLoading, isError, error, refetch } = useMyTransactionsQuery();
  const { data: inspections, isLoading: inspectionsLoading } = useMyInspectionsQuery();

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

      <div className="mt-8 rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Scheduled inspections</h2>
        {inspectionsLoading && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
        {!inspectionsLoading && (!inspections || inspections.length === 0) && (
          <p className="mt-2 text-sm text-muted-foreground">
            No inspection requests yet. Schedule one from a live listing detail page.
          </p>
        )}
        {inspections && inspections.length > 0 && (
          <ul className="mt-4 space-y-3">
            {inspections.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{s.listingTitle ?? "Listing"}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.listingLocation} · {new Date(s.scheduledAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant="outline">{s.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 space-y-6">
        {isLoading && (
          <p className="text-center text-sm text-muted-foreground">Loading transactions…</p>
        )}
        {!isLoading && (items ?? []).length === 0 && (
          <div className="rounded-xl border border-border/60 bg-card p-10 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm text-muted-foreground">
              You have not started any transactions yet.
            </p>
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
