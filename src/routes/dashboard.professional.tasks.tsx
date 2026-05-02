import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { TaskCard, type TaskStatus } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useMyTasksQuery, usePatchTaskMutation, type TaskDto } from "@/hooks/use-tasks";
import { useListingsQuery } from "@/hooks/use-listings";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/professional/tasks")({
  component: () => (
    <DashboardLayout role="professional">
      <ProTasks />
    </DashboardLayout>
  ),
});

const filters: { id: TaskStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
];

function apiStatusToCard(status: string): TaskStatus {
  switch (status) {
    case "IN_PROGRESS":
      return "in_progress";
    case "COMPLETED":
      return "completed";
    case "PENDING":
    default:
      return "pending";
  }
}

function formatDue(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function ProTasks() {
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [q, setQ] = useState("");

  const { data, isLoading, isError, error, refetch } = useMyTasksQuery({ pageSize: 100 });
  const tasks = data?.tasks ?? [];

  const { data: listingsData } = useListingsQuery();
  const listingTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of listingsData?.listings ?? []) m.set(l.id, l.title);
    return m;
  }, [listingsData?.listings]);

  const visible = useMemo(() => {
    let rows = tasks;
    if (filter !== "all") {
      const want =
        filter === "pending" ? "PENDING" : filter === "in_progress" ? "IN_PROGRESS" : "COMPLETED";
      rows = rows.filter((t) => t.status === want);
    }
    if (!q.trim()) return rows;
    const n = q.toLowerCase();
    return rows.filter(
      (t: TaskDto) =>
        t.title.toLowerCase().includes(n) ||
        t.type.toLowerCase().includes(n) ||
        (listingTitleById.get(t.listingId) ?? "").toLowerCase().includes(n),
    );
  }, [tasks, filter, q, listingTitleById]);

  const counts = {
    all: tasks.length,
    pending: tasks.filter((t) => t.status === "PENDING").length,
    in_progress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    completed: tasks.filter((t) => t.status === "COMPLETED").length,
  };

  const patchMutation = usePatchTaskMutation();

  const advance = (t: TaskDto) => {
    const next =
      t.status === "PENDING" ? "IN_PROGRESS" : t.status === "IN_PROGRESS" ? "COMPLETED" : null;
    if (!next) return;
    patchMutation.mutate(
      { id: t.id, body: { status: next } },
      {
        onSuccess: () => toast.success("Task updated."),
        onError: (e) => {
          toast.error(e instanceof ApiError ? e.message : "Update failed.");
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Assigned tasks"
        description="Tasks created by staff. Update status as you work."
      />

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load tasks."}{" "}
          <Button variant="outline" size="sm" className="ml-2 h-7" onClick={() => void refetch()}>
            Retry
          </Button>
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={String(counts.pending)} />
        <StatCard label="In progress" value={String(counts.in_progress)} />
        <StatCard label="Completed" value={String(counts.completed)} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border/60 bg-card p-1 shadow-sm">
          {filters.map((f) => {
            const active = filter === f.id;
            const c = f.id === "all" ? counts.all : counts[f.id];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-1.5 text-[10px] font-semibold ${
                    active ? "bg-primary-foreground/20" : "bg-secondary"
                  }`}
                >
                  {c}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="h-10 pl-9" />
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <div className="col-span-full text-sm text-muted-foreground">Loading tasks…</div>
        )}
        {!isLoading && visible.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No tasks match your filters.
          </div>
        )}
        {visible.map((t) => (
          <div key={t.id} className="space-y-3">
            <TaskCard
              title={t.title}
              property={listingTitleById.get(t.listingId) ?? t.listingId}
              due={formatDue(t.dueAt)}
              status={apiStatusToCard(t.status)}
              type={t.type}
            />
            {t.status !== "COMPLETED" && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={patchMutation.isPending}
                onClick={() => advance(t)}
              >
                {t.status === "PENDING" ? "Start task" : "Mark complete"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
