import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useMyDdAssignmentsQuery,
  useUploadDdAssignmentReportMutation,
  type StandaloneDdAssignmentDto,
} from "@/hooks/use-standalone-dd";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/professional/due-diligence")({
  component: ProfessionalDueDiligencePage,
});

function ProfessionalDueDiligencePage() {
  const { data: assignments, isLoading, isError, error, refetch } = useMyDdAssignmentsQuery();
  const pending = (assignments ?? []).filter((row) => row.status !== "SUBMITTED").length;
  const submitted = (assignments ?? []).filter((row) => row.status === "SUBMITTED").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Due diligence assignments"
        description="Complete schedule work for standalone cases assigned by SafeBuy staff and upload your report."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Assigned" value={String(assignments?.length ?? 0)} />
        <StatCard label="Open" value={String(pending)} />
        <StatCard label="Submitted" value={String(submitted)} />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading assignments…</p>}
      {isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          {(error as Error)?.message ?? "Could not load assignments."}{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {(assignments ?? []).map((assignment) => (
          <AssignmentCard key={assignment.id} assignment={assignment} />
        ))}
        {!isLoading && (assignments ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/70 bg-card p-8 text-center text-sm text-muted-foreground">
            No due diligence assignments yet. Staff will assign cases after a guest pays.
          </div>
        )}
      </div>
    </div>
  );
}

function AssignmentCard({ assignment }: { assignment: StandaloneDdAssignmentDto }) {
  const uploadReport = useUploadDdAssignmentReportMutation();
  const [file, setFile] = useState<File | null>(null);
  const order = assignment.order;

  const submit = async () => {
    if (!file) {
      toast.error("Choose a report file first.");
      return;
    }
    try {
      await uploadReport.mutateAsync({ id: assignment.id, file });
      setFile(null);
      toast.success("Report submitted to SafeBuy staff.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    }
  };

  return (
    <article className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{assignment.title}</h2>
            <Badge variant="outline">{assignment.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {order?.property?.title ?? "Standalone property"} —{" "}
            {order?.property?.location ?? "Location unavailable"}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">Service ID:</strong>{" "}
              <span className="font-mono">{order?.serviceId ?? "—"}</span>
            </span>
            <span>
              <strong className="text-foreground">Schedule:</strong>{" "}
              {assignment.scheduleCode.replace(/_/g, " ")}
            </span>
            <span>
              <strong className="text-foreground">Client:</strong> {order?.guestName ?? "—"}
            </span>
          </div>
        </div>
      </div>

      {assignment.reportUrl ? (
        <p className="mt-4 text-sm">
          Report on file:{" "}
          <a
            href={assignment.reportUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            Open uploaded report
          </a>
        </p>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <Button onClick={() => void submit()} disabled={uploadReport.isPending}>
            {uploadReport.isPending ? "Uploading…" : "Submit report"}
          </Button>
        </div>
      )}
    </article>
  );
}
