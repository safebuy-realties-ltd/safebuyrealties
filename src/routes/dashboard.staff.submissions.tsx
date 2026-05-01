import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus } from "lucide-react";

export const Route = createFileRoute("/dashboard/staff/submissions")({
  component: () => (
    <DashboardLayout role="staff">
      <StaffSubmissions />
    </DashboardLayout>
  ),
});

type Status = "pending" | "in_progress" | "completed";

type Submission = {
  id: string;
  listing: string;
  seller: string;
  type: string;
  status: Status;
  assignee: string | null;
};

const professionals = ["Maya Idris", "Femi Bello", "Chika Eze", "Tobi Lawal"];

const seed: Submission[] = [
  { id: "s1", listing: "Acacia Hills Estate", seller: "Olu A.", type: "Survey", status: "pending", assignee: null },
  { id: "s2", listing: "Riverside Townhouse", seller: "Maya I.", type: "Legal", status: "in_progress", assignee: "Maya Idris" },
  { id: "s3", listing: "Garden Court Residence", seller: "Tunde K.", type: "Valuation", status: "in_progress", assignee: "Femi Bello" },
  { id: "s4", listing: "Maple Heights", seller: "Adaeze O.", type: "Inspection", status: "completed", assignee: "Chika Eze" },
  { id: "s5", listing: "Cedar Park Villa", seller: "Ifeanyi U.", type: "Legal", status: "pending", assignee: null },
  { id: "s6", listing: "Sunset Bay Condo", seller: "Ngozi A.", type: "Survey", status: "pending", assignee: null },
];

const statusMeta: Record<Status, { label: string; className: string }> = {
  pending: { label: "Pending", className: "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]" },
  in_progress: { label: "In progress", className: "border-primary/20 bg-primary-soft text-primary" },
  completed: { label: "Completed", className: "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]" },
};

const filters: { id: Status | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
];

function StaffSubmissions() {
  const [items, setItems] = useState<Submission[]>(seed);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [q, setQ] = useState("");

  const visible = useMemo(
    () =>
      items.filter((s) => {
        if (filter !== "all" && s.status !== filter) return false;
        if (q && !`${s.listing} ${s.seller} ${s.type}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [items, filter, q],
  );

  const counts = {
    all: items.length,
    pending: items.filter((s) => s.status === "pending").length,
    in_progress: items.filter((s) => s.status === "in_progress").length,
    completed: items.filter((s) => s.status === "completed").length,
  };

  const assign = (id: string, who: string) =>
    setItems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, assignee: who, status: s.status === "pending" ? "in_progress" : s.status } : s)),
    );

  return (
    <>
      <PageHeader
        title="Submissions"
        description="Review incoming submissions and assign professionals."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="All" value={String(counts.all)} />
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
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search submissions…" className="h-10 pl-9" />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-12 gap-4 border-b border-border/60 bg-secondary/40 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div className="col-span-3">Listing</div>
          <div className="col-span-2">Seller</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Assignee</div>
        </div>
        <ul className="divide-y divide-border/60">
          {visible.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">No submissions match.</li>
          )}
          {visible.map((s) => (
            <li key={s.id} className="grid grid-cols-1 gap-2 px-5 py-4 text-sm md:grid-cols-12 md:items-center md:gap-4">
              <div className="col-span-3 font-medium text-foreground">{s.listing}</div>
              <div className="col-span-2 text-muted-foreground">{s.seller}</div>
              <div className="col-span-2 text-muted-foreground">{s.type}</div>
              <div className="col-span-2">
                <Badge variant="outline" className={statusMeta[s.status].className}>
                  {statusMeta[s.status].label}
                </Badge>
              </div>
              <div className="col-span-3 flex items-center justify-between gap-2">
                {s.assignee ? (
                  <span className="truncate text-foreground">{s.assignee}</span>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
                <AssignMenu onAssign={(who) => assign(s.id, who)} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function AssignMenu({ onAssign }: { onAssign: (who: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        <UserPlus className="mr-1 h-3.5 w-3.5" /> Assign
      </Button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            {professionals.map((p) => (
              <button
                key={p}
                onClick={() => { onAssign(p); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
              >
                {p}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
