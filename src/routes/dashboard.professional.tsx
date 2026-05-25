import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export const Route = createFileRoute("/dashboard/professional")({
  component: () => (
    <DashboardLayout role="professional">
      <Outlet />
    </DashboardLayout>
  ),
});
