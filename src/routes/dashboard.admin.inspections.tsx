import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api";
import type { InspectionSlotDto } from "@/hooks/use-inspections";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

type QueueItem = InspectionSlotDto & {
  listingTitle?: string;
  listingLocation?: string;
  requesterName?: string;
  requesterEmail?: string;
};

export const Route = createFileRoute("/dashboard/admin/inspections")({
  component: StaffInspectionsPage,
});

function useInspectionQueueQuery() {
  return useQuery({
    queryKey: ["inspections", "queue"],
    queryFn: () => apiRequest<QueueItem[]>("/inspections/queue").then((e) => e.data),
  });
}

function StaffInspectionsPage() {
  const { data: slots, isLoading, isError } = useInspectionQueueQuery();
  const qc = useQueryClient();

  const patch = useMutation({
    mutationFn: (body: { id: string; status: string; outcome?: string }) =>
      apiRequest<InspectionSlotDto>(`/inspection-slots/${body.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: body.status,
          outcome: body.outcome,
        }),
      }).then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inspections"] });
      toast.success("Inspection updated");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update inspection"),
  });

  return (
    <>
      <PageHeader title="Inspection requests" description="Confirm visits and log outcomes." />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Could not load queue.</p>}
      <div className="mt-6 space-y-3">
        {(slots ?? []).map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-4"
          >
            <div>
              <p className="font-medium">{s.listingTitle}</p>
              <p className="text-sm text-muted-foreground">
                {s.requesterName} · {new Date(s.scheduledAt).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{s.status}</Badge>
              {s.status === "REQUESTED" && (
                <Button
                  size="sm"
                  onClick={() => patch.mutate({ id: s.id, status: "CONFIRMED" })}
                  disabled={patch.isPending}
                >
                  Confirm
                </Button>
              )}
              {s.status === "CONFIRMED" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    patch.mutate({
                      id: s.id,
                      status: "COMPLETED",
                      outcome: "Visit completed — no issues noted",
                    })
                  }
                  disabled={patch.isPending}
                >
                  Log outcome
                </Button>
              )}
            </div>
          </div>
        ))}
        {!isLoading && (slots ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No pending inspection requests.</p>
        )}
      </div>
    </>
  );
}
