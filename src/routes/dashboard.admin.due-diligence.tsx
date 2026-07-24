import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useAssignStandaloneDdMutation,
  useStandaloneDdOrdersQuery,
  useStandaloneDdProfessionalsQuery,
  useUpdateStandaloneDdOrderMutation,
  useUploadStandaloneDdReportMutation,
  type StandaloneDdOrderDto,
} from "@/hooks/use-standalone-dd";
import { ApiError } from "@/lib/api";
import { toast } from "sonner";

const SCHEDULE_OPTIONS = [
  { value: "LEGAL_CHECK", label: "Schedule A — Legal" },
  { value: "ENVIRONMENTAL_CHECK", label: "Schedule B — Environmental" },
  { value: "PHYSICAL_CHECK", label: "Schedule C — Physical" },
  { value: "SECURITY_CHECK", label: "Schedule D — Security" },
] as const;

export const Route = createFileRoute("/dashboard/admin/due-diligence")({
  validateSearch: (search: Record<string, unknown>): { serviceId?: string } => ({
    serviceId: typeof search.serviceId === "string" ? search.serviceId : undefined,
  }),
  component: StaffDueDiligenceQueuePage,
});

type StatusFilter = "all" | "SUBMITTED" | "PAID" | "IN_PROGRESS" | "COMPLETE";

function statusBadgeClass(status: string) {
  if (status === "COMPLETE") return "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]";
  if (status === "IN_PROGRESS") return "border-primary/20 bg-primary-soft text-primary";
  if (status === "SUBMITTED" || status === "PAID")
    return "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]";
  return "border-border/60 bg-muted text-muted-foreground";
}

function StaffDueDiligenceQueuePage() {
  const { serviceId: highlightServiceId } = Route.useSearch();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const {
    data: orders,
    isLoading,
    isError,
    error,
    refetch,
  } = useStandaloneDdOrdersQuery(statusFilter === "all" ? undefined : statusFilter);

  const rows = useMemo(() => {
    const filtered = (orders ?? []).filter(
      (row) => row.status !== "PENDING_PAYMENT" || statusFilter === "SUBMITTED",
    );
    if (!highlightServiceId) return filtered;
    return [...filtered].sort((a, b) => {
      if (a.serviceId === highlightServiceId) return -1;
      if (b.serviceId === highlightServiceId) return 1;
      return 0;
    });
  }, [orders, statusFilter, highlightServiceId]);

  const stats = useMemo(() => {
    const list = orders ?? [];
    return {
      submitted: list.filter((row) => row.status === "SUBMITTED" || row.status === "PAID").length,
      inProgress: list.filter((row) => row.status === "IN_PROGRESS").length,
      complete: list.filter((row) => row.status === "COMPLETE").length,
    };
  }, [orders]);

  useEffect(() => {
    if (!highlightServiceId) return;
    const el = document.getElementById(`dd-case-${highlightServiceId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlightServiceId, rows.length]);

  return (
    <>
      <PageHeader
        title="Due diligence queue"
        description="Review submitted requests, confirm quotes with clients, assign professionals, and close cases."
      />
      {highlightServiceId && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-foreground">
          Opened from notification for{" "}
          <span className="font-mono font-medium">{highlightServiceId}</span>
        </div>
      )}

      {isError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load the due diligence queue."}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="New / awaiting quote" value={String(stats.submitted)} />
        <StatCard label="In progress" value={String(stats.inProgress)} />
        <StatCard label="Complete" value={String(stats.complete)} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(["all", "SUBMITTED", "IN_PROGRESS", "COMPLETE"] as StatusFilter[]).map((filter) => (
          <Button
            key={filter}
            variant={statusFilter === filter ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(filter)}
          >
            {filter === "all" ? "All managed cases" : filter.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      <div className="mt-8 space-y-5">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
            No due diligence cases match this filter.
          </div>
        )}
        {rows.map((row) => (
          <StaffDueDiligenceCard
            key={row.serviceId}
            row={row}
            highlighted={row.serviceId === highlightServiceId}
          />
        ))}
      </div>
    </>
  );
}

function StaffDueDiligenceCard({
  row,
  highlighted = false,
}: {
  row: StandaloneDdOrderDto;
  highlighted?: boolean;
}) {
  const updateOrder = useUpdateStandaloneDdOrderMutation();
  const uploadReport = useUploadStandaloneDdReportMutation();
  const assignProfessional = useAssignStandaloneDdMutation();
  const { data: professionals } = useStandaloneDdProfessionalsQuery();
  const [verdict, setVerdict] = useState(row.verdict ?? "");
  const [staffNotes, setStaffNotes] = useState(row.staffNotes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [professionalId, setProfessionalId] = useState("");
  const selectedSchedules = Object.keys(row.checklistSelections ?? {});
  const defaultSchedule = selectedSchedules[0] ?? SCHEDULE_OPTIONS[0].value;
  const [scheduleCode, setScheduleCode] = useState<string>(defaultSchedule);

  const suggestedIds = useMemo(() => {
    const fromOrder = new Set((row.suggestedProfessionals ?? []).map((pro) => pro.id));
    return fromOrder;
  }, [row.suggestedProfessionals]);

  const sortedProfessionals = useMemo(() => {
    const list = professionals ?? [];
    return [...list].sort((a, b) => {
      const aSuggested = suggestedIds.has(a.id) || a.suggested ? 1 : 0;
      const bSuggested = suggestedIds.has(b.id) || b.suggested ? 1 : 0;
      return bSuggested - aSuggested;
    });
  }, [professionals, suggestedIds]);

  const updateStatus = async (status: "IN_PROGRESS" | "COMPLETE") => {
    try {
      await updateOrder.mutateAsync({
        id: row.id,
        body: {
          status,
          verdict: verdict.trim() || undefined,
          staffNotes: staffNotes.trim() || undefined,
        },
      });
      toast.success(status === "COMPLETE" ? "Case completed." : "Case moved to in progress.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update the case.");
    }
  };

  const submitReport = async () => {
    if (!file) {
      toast.error("Choose a report file first.");
      return;
    }
    try {
      await uploadReport.mutateAsync({ id: row.id, file });
      setFile(null);
      toast.success("Report uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the report.");
    }
  };

  const assign = async () => {
    if (!professionalId) {
      toast.error("Select a verified professional.");
      return;
    }
    try {
      await assignProfessional.mutateAsync({
        id: row.id,
        body: { professionalId, scheduleCode },
      });
      toast.success("Professional assigned.");
      setProfessionalId("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not assign professional.");
    }
  };

  const canManage = row.status !== "PENDING_PAYMENT";
  const checklist = row.checklistSummary ?? [];

  return (
    <article
      id={`dd-case-${row.serviceId}`}
      className={`rounded-2xl border bg-card p-6 shadow-[var(--shadow-card)] ${
        highlighted ? "border-primary ring-1 ring-primary/30" : "border-border/60"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              {row.property?.title ?? row.listing?.title ?? "Standalone property"}
            </h2>
            <Badge variant="outline" className={statusBadgeClass(row.status)}>
              {row.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {row.property?.location ?? row.listing?.location ?? "Location unavailable"}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">Service ID:</strong>{" "}
              <span className="font-mono">{row.serviceId}</span>
            </span>
            <span>
              <strong className="text-foreground">Case ID:</strong>{" "}
              <span className="font-mono">{row.caseId}</span>
            </span>
            <span>
              <strong className="text-foreground">Pricing:</strong> Quote pending
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">{row.guestName}</p>
          <p className="text-muted-foreground">{row.guestEmail}</p>
          <p className="text-muted-foreground">{row.guestPhone}</p>
        </div>
      </div>

      {checklist.length > 0 && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {checklist.map((schedule) => (
            <div key={schedule.code} className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p className="text-sm font-semibold text-foreground">{schedule.name}</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {schedule.items.map((item) => (
                  <li key={item.code}>• {item.label}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_0.9fr]">
        <div>
          <label className="text-sm font-medium text-foreground">Verdict</label>
          <Input
            className="mt-2"
            value={verdict}
            onChange={(event) => setVerdict(event.target.value)}
            placeholder="PROCEED / PROCEED_WITH_CAUTION / DO_NOT_PROCEED"
            disabled={!canManage}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Staff notes</label>
          <Textarea
            className="mt-2"
            rows={3}
            value={staffNotes}
            onChange={(event) => setStaffNotes(event.target.value)}
            placeholder="Quote notes, client follow-up, or internal context."
            disabled={!canManage}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Upload report</label>
          <Input
            className="mt-2"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            disabled={!canManage}
          />
          <Button
            className="mt-3 w-full"
            variant="outline"
            onClick={() => void submitReport()}
            disabled={!canManage || uploadReport.isPending}
          >
            {uploadReport.isPending ? "Uploading…" : "Upload report"}
          </Button>
        </div>
      </div>

      {canManage && (
        <div className="mt-5 rounded-2xl border border-border/60 bg-muted/20 p-4">
          <p className="text-sm font-medium text-foreground">Assign professional</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The platform suggests professionals by schedule (for example lawyers for legal). You
            choose who actually receives the assignment.
          </p>
          {(row.suggestedProfessionals ?? []).length > 0 && (
            <div className="mt-3 rounded-xl border border-primary/20 bg-primary-soft/40 px-3 py-2 text-xs text-foreground">
              Suggested for this request:{" "}
              {(row.suggestedProfessionals ?? [])
                .slice(0, 5)
                .map((pro) => `${pro.name} (${pro.professionalType ?? "PRO"})`)
                .join(" · ")}
            </div>
          )}
          <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={professionalId}
              onChange={(event) => setProfessionalId(event.target.value)}
            >
              <option value="">Select professional…</option>
              {sortedProfessionals.map((pro) => {
                const isSuggested = suggestedIds.has(pro.id) || Boolean(pro.suggested);
                return (
                  <option key={pro.id} value={pro.id}>
                    {isSuggested ? "★ " : ""}
                    {pro.name} ({pro.professionalType ?? "PRO"}) — {pro.email}
                  </option>
                );
              })}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={scheduleCode}
              onChange={(event) => setScheduleCode(event.target.value)}
            >
              {SCHEDULE_OPTIONS.filter(
                (option) =>
                  selectedSchedules.length === 0 || selectedSchedules.includes(option.value),
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              onClick={() => void assign()}
              disabled={assignProfessional.isPending || !professionalId}
            >
              {assignProfessional.isPending ? "Assigning…" : "Assign"}
            </Button>
          </div>
          {(row.assignments ?? []).length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {(row.assignments ?? []).map((assignment) => (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-card px-3 py-2"
                >
                  <span>
                    <strong>{assignment.professional?.name ?? "Professional"}</strong>
                    {" — "}
                    {assignment.scheduleCode.replace(/_/g, " ")}
                  </span>
                  <Badge variant="outline">{assignment.status}</Badge>
                  {assignment.reportUrl && (
                    <a
                      href={assignment.reportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      View report
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(row.reports ?? []).length > 0 && (
        <div className="mt-5 flex flex-wrap gap-3">
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
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() => void updateStatus("IN_PROGRESS")}
          disabled={!canManage || updateOrder.isPending}
        >
          Mark in progress
        </Button>
        <Button
          onClick={() => void updateStatus("COMPLETE")}
          disabled={!canManage || updateOrder.isPending}
        >
          Mark complete
        </Button>
      </div>
    </article>
  );
}
