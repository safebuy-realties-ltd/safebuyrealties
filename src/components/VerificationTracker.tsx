import { CheckCircle2, Circle, Loader2 } from "lucide-react";

export type VerificationStep = {
  label: string;
  description?: string;
  status: "completed" | "current" | "pending";
  timestamp?: string;
};

export const defaultVerificationSteps: VerificationStep[] = [
  { label: "Submission received", status: "completed", timestamp: "Apr 12, 2026 · 10:24" },
  { label: "Document review", status: "completed", timestamp: "Apr 14, 2026 · 14:08" },
  { label: "Field verification", status: "completed", timestamp: "Apr 19, 2026 · 09:45" },
  { label: "Legal validation", status: "current", timestamp: "Started Apr 28, 2026" },
  { label: "Final approval", status: "pending" },
];

export function VerificationTracker({
  steps = defaultVerificationSteps,
  compact = false,
}: {
  steps?: VerificationStep[];
  compact?: boolean;
}) {
  const completed = steps.filter((s) => s.status === "completed").length;
  const total = steps.length;
  const percent = Math.round((completed / total) * 100);

  return (
    <div>
      {!compact && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Verification progress</span>
            <span className="text-muted-foreground">
              {completed}/{total} milestones
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5">
              {s.status === "completed" ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : s.status === "current" ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  s.status === "pending" ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {s.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.timestamp
                  ? s.timestamp
                  : s.status === "completed"
                    ? "Completed"
                    : s.status === "current"
                      ? "In progress"
                      : "Pending"}
              </p>
              {s.description && (
                <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
