import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export const Route = createFileRoute("/dashboard/staff")({
  component: () => (
    <DashboardLayout role="staff">
      <Outlet />
    </DashboardLayout>
  ),
});
