import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStandaloneDdOrdersQuery } from "@/hooks/use-standalone-dd";

export const Route = createFileRoute("/dashboard/buyer/due-diligence")({
  component: BuyerDueDiligencePage,
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function formatNgn(amount: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `₦${amount}`;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function statusBadgeClass(status: string) {
  if (status === "COMPLETE") return "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]";
  if (status === "IN_PROGRESS") return "border-primary/20 bg-primary-soft text-primary";
  if (status === "PAID") return "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]";
  return "border-border/60 bg-muted text-muted-foreground";
}

function BuyerDueDiligencePage() {
  const { data: orders, isLoading, isError, error, refetch } = useStandaloneDdOrdersQuery();
  const rows = useMemo(() => orders ?? [], [orders]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.status === "PAID" || row.status === "IN_PROGRESS").length,
      complete: rows.filter((row) => row.status === "COMPLETE").length,
    };
  }, [rows]);

  return (
    <>
      <PageHeader
        title="Due diligence cases"
        description="Track standalone due diligence requests, verdicts, and final reports."
        actions={
          <Button asChild>
            <Link to="/due-diligence/request">Start a new request</Link>
          </Button>
        }
      />

      {isError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load due diligence cases."}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="All cases" value={String(stats.total)} />
        <StatCard label="Active" value={String(stats.active)} hint="Paid or in progress" />
        <StatCard label="Complete" value={String(stats.complete)} />
      </div>

      <div className="mt-8 rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Service ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Reports</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No standalone due diligence cases yet. Start one from the public due diligence
                  page.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.serviceId}>
                <TableCell>
                  <div>
                    <p className="font-medium text-foreground">
                      {row.property?.title ?? row.listing?.title ?? "Standalone property"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.property?.location ?? row.listing?.location ?? "Location unavailable"}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.serviceId}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadgeClass(row.status)}>
                    {row.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell>{formatNgn(row.total)}</TableCell>
                <TableCell>{row.verdict ? row.verdict.replace(/_/g, " ") : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(row.updatedAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {(row.reports ?? []).length === 0 && (
                      <span className="text-xs text-muted-foreground">No reports yet</span>
                    )}
                    {(row.reports ?? []).map((report, index) => (
                      <a
                        key={report.key}
                        href={report.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary underline"
                      >
                        Report {index + 1}
                      </a>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
