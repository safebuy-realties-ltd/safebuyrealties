import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, UserPlus, CheckCircle2, XCircle, History } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/staff/workflow")({
  component: () => (
    <DashboardLayout role="staff">
      <StaffWorkflow />
    </DashboardLayout>
  ),
});

type Status = "pending" | "in_progress" | "completed" | "rejected";

type Submission = {
  id: string;
  listing: string;
  seller: string;
  type: string;
  status: Status;
  assignee: string | null;
  submitted: string;
};

type AuditEntry = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target: string;
};

const professionals = ["Maya Idris", "Femi Bello", "Chika Eze", "Tobi Lawal"];

const seed: Submission[] = [
  { id: "s1", listing: "Acacia Hills Estate", seller: "Olu A.", type: "Survey", status: "pending", assignee: null, submitted: "Apr 28" },
  { id: "s2", listing: "Riverside Townhouse", seller: "Maya I.", type: "Legal", status: "in_progress", assignee: "Maya Idris", submitted: "Apr 24" },
  { id: "s3", listing: "Garden Court Residence", seller: "Tunde K.", type: "Valuation", status: "in_progress", assignee: "Femi Bello", submitted: "Apr 22" },
  { id: "s4", listing: "Maple Heights", seller: "Adaeze O.", type: "Inspection", status: "completed", assignee: "Chika Eze", submitted: "Apr 18" },
  { id: "s5", listing: "Cedar Park Villa", seller: "Ifeanyi U.", type: "Legal", status: "pending", assignee: null, submitted: "Apr 27" },
];

const statusMeta: Record<Status, { label: string; className: string }> = {
  pending: { label: "Pending", className: "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]" },
  in_progress: { label: "In progress", className: "border-primary/20 bg-primary-soft text-primary" },
  completed: { label: "Completed", className: "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]" },
  rejected: { label: "Rejected", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

const filters: { id: Status | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "rejected", label: "Rejected" },
];

function nowStamp() {
  return new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StaffWorkflow() {
  const [items, setItems] = useState<Submission[]>(seed);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [q, setQ] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([
    { id: "a0", ts: "Apr 28 · 10:14", actor: "System", action: "Received submission", target: "Acacia Hills Estate" },
    { id: "a1", ts: "Apr 24 · 09:02", actor: "Chika Eze", action: "Assigned Maya Idris", target: "Riverside Townhouse" },
  ]);

  const [confirm, setConfirm] = useState<
    | { kind: "assign"; id: string; who: string }
    | { kind: "approve"; id: string }
    | { kind: "reject"; id: string }
    | null
  >(null);

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
    rejected: items.filter((s) => s.status === "rejected").length,
  };

  const log = (entry: Omit<AuditEntry, "id" | "ts">) =>
    setAudit((prev) => [{ id: crypto.randomUUID(), ts: nowStamp(), ...entry }, ...prev].slice(0, 50));

  const performConfirm = () => {
    if (!confirm) return;
    const sub = items.find((s) => s.id === confirm.id);
    if (!sub) return;

    if (confirm.kind === "assign") {
      setItems((prev) =>
        prev.map((s) =>
          s.id === confirm.id
            ? { ...s, assignee: confirm.who, status: s.status === "pending" ? "in_progress" : s.status }
            : s,
        ),
      );
      log({ actor: "You", action: `Assigned ${confirm.who}`, target: sub.listing });
      toast.success(`Assigned ${confirm.who}`);
    } else if (confirm.kind === "approve") {
      setItems((prev) => prev.map((s) => (s.id === confirm.id ? { ...s, status: "completed" } : s)));
      log({ actor: "You", action: "Approved submission", target: sub.listing });
      toast.success("Submission approved");
    } else if (confirm.kind === "reject") {
      setItems((prev) => prev.map((s) => (s.id === confirm.id ? { ...s, status: "rejected" } : s)));
      log({ actor: "You", action: "Rejected submission", target: sub.listing });
      toast.success("Submission rejected");
    }
    setConfirm(null);
  };

  const confirmCopy = (() => {
    if (!confirm) return { title: "", desc: "", action: "Confirm" };
    const sub = items.find((s) => s.id === confirm.id);
    const t = sub?.listing ?? "this submission";
    if (confirm.kind === "assign") return { title: `Assign ${confirm.who}?`, desc: `${confirm.who} will be notified and the submission for ${t} moves to In progress.`, action: "Assign" };
    if (confirm.kind === "approve") return { title: "Approve submission?", desc: `Approving ${t} marks the verification as completed.`, action: "Approve" };
    return { title: "Reject submission?", desc: `Rejecting ${t} will notify the seller and close the workflow.`, action: "Reject" };
  })();

  return (
    <>
      <PageHeader
        title="Workflow"
        description="Review submissions, assign professionals, and keep an auditable trail."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Pending" value={String(counts.pending)} />
        <StatCard label="In progress" value={String(counts.in_progress)} />
        <StatCard label="Completed" value={String(counts.completed)} />
        <StatCard label="Rejected" value={String(counts.rejected)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex flex-wrap rounded-lg border border-border/60 bg-card p-1 shadow-sm">
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
                    <span className={`rounded-full px-1.5 text-[10px] font-semibold ${active ? "bg-primary-foreground/20" : "bg-secondary"}`}>{c}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative ml-auto min-w-[200px] flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-10 pl-9" />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {visible.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">
                No submissions match your filters.
              </div>
            )}
            {visible.map((s) => (
              <div key={s.id} className="rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.listing}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.type} · Seller {s.seller} · Submitted {s.submitted}
                    </p>
                  </div>
                  <Badge variant="outline" className={statusMeta[s.status].className}>
                    {statusMeta[s.status].label}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    Assignee:
                    <span className="font-medium text-foreground">{s.assignee ?? "Unassigned"}</span>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Select onValueChange={(who) => setConfirm({ kind: "assign", id: s.id, who })}>
                      <SelectTrigger className="h-8 w-[150px]">
                        <UserPlus className="mr-1 h-3.5 w-3.5" />
                        <SelectValue placeholder="Assign" />
                      </SelectTrigger>
                      <SelectContent>
                        {professionals.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {s.status !== "completed" && (
                      <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "approve", id: s.id })}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                      </Button>
                    )}
                    {s.status !== "rejected" && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirm({ kind: "reject", id: s.id })}>
                        <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Activity log</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Audit trail of recent workflow actions.</p>
          <ol className="mt-4 space-y-4">
            {audit.map((a) => (
              <li key={a.id} className="relative pl-5">
                <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-primary" />
                <p className="text-sm text-foreground">
                  <span className="font-medium">{a.actor}</span> {a.action}
                </p>
                <p className="text-xs text-muted-foreground">{a.target} · {a.ts}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy.desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performConfirm}>{confirmCopy.action}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
