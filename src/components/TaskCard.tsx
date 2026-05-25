import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin } from "lucide-react";

export type TaskStatus = "pending" | "in_progress" | "completed";

const statusStyles: Record<TaskStatus, string> = {
  pending: "bg-warning/15 text-[oklch(0.45_0.13_75)] border-warning/30",
  in_progress: "bg-primary-soft text-primary border-primary/20",
  completed: "bg-success/15 text-[oklch(0.4_0.12_155)] border-success/25",
};

const statusLabels: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

export function TaskCard({
  title,
  property,
  due,
  status,
  type,
}: {
  title: string;
  property: string;
  due: string;
  status: TaskStatus;
  type: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elegant)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {type}
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{title}</h3>
        </div>
        <Badge variant="outline" className={statusStyles[status]}>
          {statusLabels[status]}
        </Badge>
      </div>
      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" />
          {property}
        </p>
        <p className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5" />
          Due {due}
        </p>
      </div>
    </div>
  );
}
