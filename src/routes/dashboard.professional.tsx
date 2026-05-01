import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { TaskCard } from "@/components/TaskCard";

export const Route = createFileRoute("/dashboard/professional")({
  component: () => (
    <DashboardLayout role="professional">
      <ProOverview />
    </DashboardLayout>
  ),
});

function ProOverview() {
  return (
    <>
      <PageHeader
        title="Assigned tasks"
        description="Verifications and reports awaiting your action."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value="5" />
        <StatCard label="In progress" value="3" />
        <StatCard label="Completed (30d)" value="22" />
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <TaskCard title="Title verification" property="Garden Court Residence" due="May 5" status="in_progress" type="Legal" />
        <TaskCard title="Survey inspection" property="Acacia Hills Estate" due="May 7" status="pending" type="Survey" />
        <TaskCard title="Property valuation" property="Maple Heights Apartment" due="May 3" status="pending" type="Valuation" />
        <TaskCard title="Structural report" property="Cedar Park Villa" due="Apr 28" status="completed" type="Inspection" />
        <TaskCard title="Encumbrance check" property="Riverside Townhouse" due="May 10" status="in_progress" type="Legal" />
        <TaskCard title="Boundary verification" property="Sunset Bay Condo" due="May 12" status="pending" type="Survey" />
      </div>
    </>
  );
}
