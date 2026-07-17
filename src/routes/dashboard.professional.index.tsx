import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { TaskCard } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { BadgeCheck } from "lucide-react";
import { useMyTasksQuery, useTaskKpiCounts } from "@/hooks/use-tasks";
import { useListingsQuery } from "@/hooks/use-listings";
import {
  isProfessionalProfileComplete,
  isProfessionalProfilePendingReview,
  useMyProfileQuery,
} from "@/hooks/use-professional-profile";

export const Route = createFileRoute("/dashboard/professional/")({
  component: ProOverview,
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
  const { data: profile, isLoading: profileLoading } = useMyProfileQuery();
  const { data: listingsData } = useListingsQuery();
  const profileComplete = isProfessionalProfileComplete(profile);
  const pendingReview = isProfessionalProfilePendingReview(profile);
  const showCredentialBanner =
    !profileLoading && (!profile || profile.verifiedStatus !== "VERIFIED");
  const needsOnboarding = !profile || !profileComplete;
  const bannerTitle =
    !profile || !profileComplete
      ? "Finish your onboarding"
      : profile.verifiedStatus === "REJECTED"
        ? "Credentials need changes"
        : "Credentials pending review";
  const bannerBody =
    !profile || !profileComplete
      ? "Complete your regulatory details and upload both required documents before staff can review your profile."
      : profile.verifiedStatus === "REJECTED"
        ? `Staff rejected your last submission${profile.rejectionNote ? `: ${profile.rejectionNote}` : "."}`
        : pendingReview
          ? "Your onboarding package is in the staff review queue. You will be notified when it is approved or rejected."
          : "Add the missing details or documents on your credentials page to become eligible for staff approval.";
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

      {showCredentialBanner && (
        <div className="mb-6 flex gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 shadow-[var(--shadow-card)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white">
            <BadgeCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{bannerTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{bannerBody}</p>
            <Button className="mt-4" size="sm" asChild>
              {needsOnboarding ? (
                <Link to="/onboarding/professional">Continue</Link>
              ) : (
                <Link to="/dashboard/professional/credentials">Continue</Link>
              )}
            </Button>
          </div>
        </div>
      )}

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
