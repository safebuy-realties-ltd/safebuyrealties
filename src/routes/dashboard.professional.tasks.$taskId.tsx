import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useMyTaskByIdQuery, usePatchTaskMutation } from "@/hooks/use-tasks";
import { useUploadDocumentMutation } from "@/hooks/use-documents";
import { useVerificationListingQuery } from "@/hooks/use-verification";
import { RISK_FLAGS } from "@/lib/risk-flags";

export const Route = createFileRoute("/dashboard/professional/tasks/$taskId")({
  component: () => (
    <DashboardLayout role="professional">
      <TaskDetailPage />
    </DashboardLayout>
  ),
});

function TaskDetailPage() {
  const { taskId } = Route.useParams();
  const { data, isLoading, isError, error } = useMyTaskByIdQuery(taskId);
  const task = data?.data;

  const [checklist, setChecklist] = useState<{ id: string; label: string; done: boolean }[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("IN_PROGRESS");
  const [file, setFile] = useState<File | null>(null);
  const [selectedRiskFlags, setSelectedRiskFlags] = useState<string[]>([]);

  const patchMutation = usePatchTaskMutation();
  const uploadMutation = useUploadDocumentMutation();

  const { data: verificationSteps } = useVerificationListingQuery(
    task?.listingId ?? "",
    !!task?.listingId,
  );

  const revisionStep = useMemo(() => {
    if (!task || !verificationSteps) return null;
    return (
      verificationSteps.find(
        (s) => s.type === task.type && s.status === "REVISION_REQUESTED" && !!s.revisionNote,
      ) ?? null
    );
  }, [task, verificationSteps]);

  const feedback = useMemo(() => {
    const raw = task?.reviewFeedback;
    if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
    if (typeof raw === "string" && raw.trim()) return [raw];
    return [];
  }, [task]);

  if (isLoading) return <p className="mt-6 text-sm text-muted-foreground">Loading task…</p>;
  if (isError || !task) {
    return (
      <p className="mt-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "Task not found."}
      </p>
    );
  }

  const requiresEvidence = Boolean(task.requiresDocumentEvidence);

  const submit = () => {
    const doPatch = () =>
      patchMutation.mutate(
        {
          id: task.id,
          body: {
            status,
            completionNotes: notes,
            checklist,
            report: {
              submittedAt: new Date().toISOString(),
              summary: notes,
              riskFlags: selectedRiskFlags,
            },
          },
        },
        {
          onSuccess: () => toast.success("Task report saved."),
          onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to update task."),
        },
      );

    if (requiresEvidence && file) {
      uploadMutation.mutate(
        {
          listingId: task.listingId,
          category: `TASK_EVIDENCE:${task.id}`,
          file,
        },
        {
          onSuccess: () => {
            toast.success("Evidence uploaded.");
            doPatch();
          },
          onError: (e) => toast.error(e instanceof ApiError ? e.message : "Upload failed."),
        },
      );
      return;
    }

    if (requiresEvidence && !file) {
      toast.error("This task requires evidence. Upload a document before submitting.");
      return;
    }

    doPatch();
  };

  const toggleRiskFlag = (code: string) => {
    setSelectedRiskFlags((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  return (
    <>
      <PageHeader title={task.title} description={`Task ID: ${task.id}`} />
      <div className="mb-4">
        <Link
          to="/dashboard/professional/tasks"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Back to task list
        </Link>
      </div>

      {revisionStep && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-400 bg-amber-50 p-4 text-amber-900"
        >
          <p className="text-sm font-semibold">Revision requested</p>
          <p className="mt-1 text-sm">{revisionStep.revisionNote}</p>
          <p className="mt-2 text-xs text-amber-800">
            Address the feedback above, update your report, and resubmit below.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Task metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>Status:</strong> {task.status}
            </p>
            <p>
              <strong>Type:</strong> {task.type}
            </p>
            <p>
              <strong>Listing:</strong> {task.listingId}
            </p>
            <p>
              <strong>Due:</strong> {task.dueAt ? new Date(task.dueAt).toLocaleString() : "—"}
            </p>
            <p>
              <strong>Description:</strong> {task.description ?? "—"}
            </p>
            {requiresEvidence && <Badge variant="outline">Document evidence required</Badge>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reviewer feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <strong>Revision status:</strong> {task.revisionStatus ?? "none"}
            </p>
            {feedback.length === 0 ? (
              <p className="text-muted-foreground">No reviewer feedback yet.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-4">
                {feedback.map((f, idx) => (
                  <li key={`${idx}-${f.slice(0, 12)}`}>{f}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Checklist & report submission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[0, 1, 2].map((idx) => {
              const row = checklist[idx] ?? { id: String(idx + 1), label: "", done: false };
              return (
                <div key={idx} className="flex items-center gap-3">
                  <Checkbox
                    checked={row.done}
                    onCheckedChange={(checked) => {
                      setChecklist((prev) => {
                        const next = [...prev];
                        next[idx] = { ...row, done: Boolean(checked) };
                        return next;
                      });
                    }}
                  />
                  <Input
                    value={row.label}
                    onChange={(e) => {
                      const value = e.target.value;
                      setChecklist((prev) => {
                        const next = [...prev];
                        next[idx] = { ...row, label: value };
                        return next;
                      });
                    }}
                    placeholder={`Checklist item ${idx + 1}`}
                  />
                </div>
              );
            })}

            <div className="space-y-2">
              <Label htmlFor="status">Status update</Label>
              <Input
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="IN_PROGRESS or COMPLETED"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Completion / revision notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Summarize work completed and any remaining issues."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="evidence">Evidence document</Label>
              <Input
                id="evidence"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="space-y-2">
              <Label>Risk flags</Label>
              <p className="text-xs text-muted-foreground">
                Select all risk conditions that apply to this property.
              </p>
              <div className="space-y-3 rounded-md border border-border p-3">
                {RISK_FLAGS.map((flag) => (
                  <div key={flag.code} className="flex items-start gap-3">
                    <Checkbox
                      id={`risk-flag-${flag.code}`}
                      checked={selectedRiskFlags.includes(flag.code)}
                      onCheckedChange={() => toggleRiskFlag(flag.code)}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col">
                      <label
                        htmlFor={`risk-flag-${flag.code}`}
                        className="cursor-pointer text-sm font-medium leading-none"
                      >
                        {flag.label}
                      </label>
                      <p className="mt-1 text-xs text-muted-foreground">{flag.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              {selectedRiskFlags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedRiskFlags.map((code) => (
                    <Badge key={code} variant="outline" className="text-xs">
                      {RISK_FLAGS.find((f) => f.code === code)?.label ?? code}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={submit} disabled={patchMutation.isPending || uploadMutation.isPending}>
              Submit report
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
