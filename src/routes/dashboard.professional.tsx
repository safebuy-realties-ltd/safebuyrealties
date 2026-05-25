import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { TaskCard } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { useMyTasksQuery, useTaskKpiCounts } from "@/hooks/use-tasks";
import { useListingsQuery } from "@/hooks/use-listings";

export const Route = createFileRoute("/dashboard/professional")({
  component: () => (
    <DashboardLayout role="professional">
      <ProOverview />
    </DashboardLayout>
  ),
});

function apiStatusToCard(status: string): "pending" | "in_progress" | "completed" {
  switch (status) {
    case "IN_PROGRESS":
      return "in_progress";
    case "COMPLETED":
      return "completed";
    default:
      return "pending";
  }
}

function formatDue(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function ProOverview() {
  const { data: tasksData, isLoading } = useMyTasksQuery({ pageSize: 20 });
  const tasks = tasksData?.tasks ?? [];
  const kpis = useTaskKpiCounts();
  const { data: listingsData } = useListingsQuery();
  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of listingsData?.listings ?? []) m.set(l.id, l.title);
    return m;
  }, [listingsData?.listings]);

  const preview = tasks.slice(0, 6);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Snapshot of your assigned tasks from the API."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/professional/tasks">All tasks</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={kpis.isLoading ? "…" : String(kpis.data?.pending ?? 0)} />
        <StatCard
          label="In progress"
          value={kpis.isLoading ? "…" : String(kpis.data?.inProgress ?? 0)}
        />
        <StatCard
          label="Completed"
          value={kpis.isLoading ? "…" : String(kpis.data?.completed ?? 0)}
        />
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="col-span-full text-sm text-muted-foreground">Loading tasks…</p>}
        {!isLoading && preview.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">No tasks assigned yet.</p>
        )}
        {preview.map((t) => (
          <TaskCard
            key={t.id}
            title={t.title}
            property={titleById.get(t.listingId) ?? t.listingId}
            due={formatDue(t.dueAt)}
            status={apiStatusToCard(t.status)}
            type={t.type}
          />
        ))}
      </div>
    </>
  );
}
