import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { riskFlagLabel } from "@/lib/risk-flags";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useStaffQueueQuery, type StaffQueueFilter } from "@/hooks/use-staff-queue";
import { Textarea } from "@/components/ui/textarea";
import {
  useAssignVerificationMutation,
  useVerificationListingQuery,
  usePatchVerificationStepMutation,
  useVerificationActivityQuery,
  useAcceptStepMutation,
  useRequestRevisionMutation,
} from "@/hooks/use-verification";
import { useProfessionalsQuery } from "@/hooks/use-users";
import { ApiError } from "@/lib/api";
import { useCreateTaskMutation } from "@/hooks/use-tasks";

export const Route = createFileRoute("/dashboard/staff/workflow")({
  validateSearch: (search: Record<string, unknown>): { listing?: string } => ({
    listing: typeof search.listing === "string" ? search.listing : undefined,
  }),
  component: StaffWorkflow,
});

function StaffWorkflow() {
  const { listing: listingFromSearch } = Route.useSearch();
  const [filter, setFilter] = useState<"all" | StaffQueueFilter>("all");
  const {
    data: queueData,
    isLoading: listingsLoading,
    isError: listingsError,
    error: listingsErr,
  } = useStaffQueueQuery(filter);
  const cards = useMemo(() => queueData?.cards ?? [], [queueData?.cards]);

  const { data: prosData, isLoading: prosLoading } = useProfessionalsQuery();
  const professionals = prosData?.users ?? [];

  const [q, setQ] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  useEffect(() => {
    if (!listingFromSearch) return;
    if (cards.some((l) => l.listingId === listingFromSearch)) {
      setSelectedListingId(listingFromSearch);
    }
  }, [listingFromSearch, cards]);

  const filteredListings = useMemo(() => {
    if (!q.trim()) return cards;
    const n = q.toLowerCase();
    return cards.filter(
      (l) =>
        l.title.toLowerCase().includes(n) ||
        l.subtitle.toLowerCase().includes(n) ||
        l.listingId.toLowerCase().includes(n) ||
        l.backendStatus.toLowerCase().includes(n),
    );
  }, [cards, q]);

  const selectedListing = cards.find((l) => l.listingId === selectedListingId) ?? null;

  const {
    data: steps,
    isLoading: stepsLoading,
    isError: stepsError,
    error: stepsErr,
    refetch: refetchSteps,
  } = useVerificationListingQuery(selectedListingId ?? "", !!selectedListingId);

  const assignMutation = useAssignVerificationMutation();
  const createTaskMutation = useCreateTaskMutation();
  const patchStepMutation = usePatchVerificationStepMutation();
  const acceptStepMutation = useAcceptStepMutation();
  const requestRevisionMutation = useRequestRevisionMutation();
  const [professionalByStep, setProfessionalByStep] = useState<Record<string, string>>({});
  const [revisionOpenFor, setRevisionOpenFor] = useState<string | null>(null);
  const [revisionNoteByStep, setRevisionNoteByStep] = useState<Record<string, string>>({});
  const {
    data: activity = [],
    isLoading: activityLoading,
    isError: activityError,
  } = useVerificationActivityQuery(selectedListingId ?? "", !!selectedListingId);

  const inWorkflow = useMemo(
    () => cards.filter((l) => l.queueStatus === "in_progress").length,
    [cards],
  );

  const assignStep = (stepType: string) => {
    if (!selectedListingId) return;
    const professionalId = professionalByStep[stepType];
    if (!professionalId) {
      toast.error("Choose a professional first.");
      return;
    }
    assignMutation.mutate(
      { listingId: selectedListingId, professionalId, stepType },
      {
        onSuccess: async () => {
          try {
            await createTaskMutation.mutateAsync({
              listingId: selectedListingId,
              assigneeId: professionalId,
              title: `${stepType.replace(/_/g, " ")} verification`,
              type: stepType,
              description: `Complete ${stepType.replace(/_/g, " ")} for listing verification.`,
            });
            toast.success("Verification step assigned and task synced.");
          } catch (e) {
            toast.error(
              e instanceof ApiError ? e.message : "Assignment saved, but task sync failed.",
            );
          }
        },
        onError: (e) => {
          const msg = e instanceof ApiError ? e.message : "Assignment failed.";
          toast.error(msg);
        },
      },
    );
  };

  const transitionStep = (stepId: string, status: "COMPLETED" | "BLOCKED") => {
    if (!selectedListingId) return;
    patchStepMutation.mutate(
      { stepId, listingId: selectedListingId, body: { status } },
      {
        onSuccess: () => toast.success(status === "COMPLETED" ? "Step approved." : "Step blocked."),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Update failed."),
      },
    );
  };

  const acceptStep = (stepId: string) => {
    if (!selectedListingId) return;
    acceptStepMutation.mutate(
      { stepId, listingId: selectedListingId },
      {
        onSuccess: async () => {
          const { data: refreshedSteps } = await refetchSteps();
          const allDone =
            refreshedSteps?.length &&
            refreshedSteps.every((s) => s.status === "ACCEPTED" || s.status === "COMPLETED");
          if (allDone) {
            toast.success("All verification steps complete — listing is now live.");
          } else {
            toast.success("Report accepted.");
          }
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Accept failed."),
      },
    );
  };

  const submitRevision = (stepId: string) => {
    if (!selectedListingId) return;
    const note = (revisionNoteByStep[stepId] ?? "").trim();
    if (!note) {
      toast.error("Add a revision note before submitting.");
      return;
    }
    requestRevisionMutation.mutate(
      { stepId, listingId: selectedListingId, note },
      {
        onSuccess: () => {
          toast.success("Revision requested.");
          setRevisionOpenFor(null);
          setRevisionNoteByStep((prev) => ({ ...prev, [stepId]: "" }));
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Request failed."),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Workflow"
        description="Pick a listing, load verification steps, and assign each step to a professional."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Listings loaded" value={String(cards.length)} />
        <StatCard label="In review / verification" value={String(inWorkflow)} />
        <StatCard label="Professionals" value={String(professionals.length)} />
      </div>

      {listingsError && (
        <p className="mt-4 text-sm text-destructive">
          {listingsErr instanceof Error ? listingsErr.message : "Could not load listings."}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Listings</h2>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by title, location, status…"
              className="h-9 pl-8"
            />
          </div>
          <div className="mt-3 max-h-[420px] space-y-1 overflow-y-auto text-sm">
            {listingsLoading && <p className="text-muted-foreground">Loading…</p>}
            {!listingsLoading && filteredListings.length === 0 && (
              <p className="text-muted-foreground">No listings match.</p>
            )}
            {["all", "pending", "in_progress", "completed", "rejected"].map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f as "all" | StaffQueueFilter)}
              >
                {f.replace("_", " ")}
              </Button>
            ))}
            {filteredListings.map((l) => (
              <button
                key={l.listingId}
                type="button"
                onClick={() => setSelectedListingId(l.listingId)}
                className={`flex w-full flex-col rounded border px-2 py-2 text-left ${
                  selectedListingId === l.listingId
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:bg-muted/50"
                }`}
              >
                <span className="font-medium">{l.title}</span>
                <span className="text-xs text-muted-foreground">
                  {l.backendStatus} · {l.subtitle}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Verification steps</h2>
          {!selectedListingId && (
            <p className="mt-3 text-sm text-muted-foreground">
              Select a listing to load its verification pipeline.
            </p>
          )}
          {selectedListing && (
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedListing.title} — steps are created when a listing enters review (e.g.
              PENDING_REVIEW).
            </p>
          )}
          {selectedListingId && stepsError && (
            <div className="mt-3 text-sm text-destructive">
              {stepsErr instanceof ApiError ? stepsErr.message : "Failed to load steps."}
              <Button
                variant="outline"
                size="sm"
                className="ml-2 h-7"
                onClick={() => void refetchSteps()}
              >
                Retry
              </Button>
            </div>
          )}
          {selectedListingId && stepsLoading && (
            <p className="mt-3 text-sm text-muted-foreground">Loading steps…</p>
          )}
          {selectedListingId && !stepsLoading && !stepsError && steps && steps.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              No verification steps for this listing yet. Move the listing to PENDING_REVIEW to
              generate steps.
            </p>
          )}
          {steps && steps.length > 0 && (
            <ul className="mt-3 space-y-3">
              {steps.map((s) => (
                <li key={s.id} className="rounded border border-border/80 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.label}</span>
                    <Badge variant="outline">{s.status}</Badge>
                    {s.assignedProfessionalId && (
                      <span className="text-xs text-muted-foreground">
                        Assigned pro id: {s.assignedProfessionalId}
                      </span>
                    )}
                  </div>
                  {s.riskFlags && s.riskFlags.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Risk flags:</span>
                      {s.riskFlags.map((code) => (
                        <Badge key={code} variant="outline" className="text-xs">
                          {riskFlagLabel(code)}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="min-w-[200px] flex-1">
                      <p className="mb-1 text-xs text-muted-foreground">Assign professional</p>
                      <Select
                        disabled={prosLoading || professionals.length === 0}
                        value={professionalByStep[s.type] ?? ""}
                        onValueChange={(v) =>
                          setProfessionalByStep((prev) => ({ ...prev, [s.type]: v }))
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={prosLoading ? "Loading…" : "Select"} />
                        </SelectTrigger>
                        <SelectContent>
                          {professionals.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} ({p.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      className="h-9"
                      disabled={
                        assignMutation.isPending || createTaskMutation.isPending || prosLoading
                      }
                      onClick={() => assignStep(s.type)}
                    >
                      Assign
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-9"
                      disabled={patchStepMutation.isPending}
                      onClick={() => transitionStep(s.id, "COMPLETED")}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-9"
                      disabled={patchStepMutation.isPending}
                      onClick={() => transitionStep(s.id, "BLOCKED")}
                    >
                      Reject
                    </Button>
                  </div>
                  {s.status === "COMPLETED" && (
                    <div className="mt-3 border-t border-border/60 pt-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Report review
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="h-9"
                          disabled={acceptStepMutation.isPending}
                          onClick={() => acceptStep(s.id)}
                        >
                          Accept report
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9"
                          onClick={() => setRevisionOpenFor((cur) => (cur === s.id ? null : s.id))}
                        >
                          Request revision
                        </Button>
                      </div>
                      {revisionOpenFor === s.id && (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            value={revisionNoteByStep[s.id] ?? ""}
                            onChange={(e) =>
                              setRevisionNoteByStep((prev) => ({
                                ...prev,
                                [s.id]: e.target.value,
                              }))
                            }
                            placeholder="Explain what the professional needs to revise…"
                            className="min-h-[80px]"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-9"
                              disabled={requestRevisionMutation.isPending}
                              onClick={() => submitRevision(s.id)}
                            >
                              Send revision request
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9"
                              onClick={() => setRevisionOpenFor(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {s.status === "REVISION_REQUESTED" && s.revisionNote && (
                    <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                      <span className="font-semibold">Revision requested:</span> {s.revisionNote}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 border-t border-border/60 pt-4">
            <h3 className="text-sm font-semibold">Activity log</h3>
            {activityLoading && (
              <p className="mt-2 text-sm text-muted-foreground">Loading activity…</p>
            )}
            {activityError && (
              <p className="mt-2 text-sm text-destructive">Could not load activity.</p>
            )}
            {!activityLoading && !activityError && activity.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">No workflow activity yet.</p>
            )}
            {!activityLoading && !activityError && activity.length > 0 && (
              <ul className="mt-2 space-y-2 text-sm">
                {activity.map((entry) => (
                  <li key={entry.id} className="rounded border border-border/70 p-2">
                    <p className="font-medium">{entry.action.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()} · {entry.actorId ?? "system"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
