import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { TaskCard, type TaskStatus } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export const Route = createFileRoute("/dashboard/professional/tasks")({
  component: () => (
    <DashboardLayout role="professional">
      <ProTasks />
    </DashboardLayout>
  ),
});

type Task = {
  id: string;
  title: string;
  property: string;
  due: string;
  status: TaskStatus;
  type: string;
};

const seed: Task[] = [
  { id: "t1", title: "Title verification", property: "Garden Court Residence", due: "May 5", status: "in_progress", type: "Legal" },
  { id: "t2", title: "Survey inspection", property: "Acacia Hills Estate", due: "May 7", status: "pending", type: "Survey" },
  { id: "t3", title: "Property valuation", property: "Maple Heights Apartment", due: "May 3", status: "pending", type: "Valuation" },
  { id: "t4", title: "Structural report", property: "Cedar Park Villa", due: "Apr 28", status: "completed", type: "Inspection" },
  { id: "t5", title: "Encumbrance check", property: "Riverside Townhouse", due: "May 10", status: "in_progress", type: "Legal" },
  { id: "t6", title: "Boundary verification", property: "Sunset Bay Condo", due: "May 12", status: "pending", type: "Survey" },
];

const filters: { id: TaskStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
];

function ProTasks() {
  const [tasks, setTasks] = useState<Task[]>(seed);
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [q, setQ] = useState("");

  const visible = useMemo(
    () =>
      tasks.filter((t) => {
        if (filter !== "all" && t.status !== filter) return false;
        if (q && !`${t.title} ${t.property} ${t.type}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [tasks, filter, q],
  );

  const counts = {
    all: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  const advance = (id: string) =>
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next: TaskStatus = t.status === "pending" ? "in_progress" : t.status === "in_progress" ? "completed" : "completed";
        return { ...t, status: next };
      }),
    );

  return (
    <>
      <PageHeader
        title="Assigned tasks"
        description="Verifications and reports awaiting your action."
      />

      <div className="grid gap-4 sm:grid-cols-3">
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
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-[10px] font-semibold ${active ? "bg-primary-foreground/20" : "bg-secondary"}`}>
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
        {visible.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No tasks match your filters.
          </div>
        )}
        {visible.map((t) => (
          <div key={t.id} className="space-y-3">
            <TaskCard title={t.title} property={t.property} due={t.due} status={t.status} type={t.type} />
            {t.status !== "completed" && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => advance(t.id)}>
                {t.status === "pending" ? "Start task" : "Mark complete"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
