import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export const Route = createFileRoute("/dashboard/admin")({
  component: () => (
    <DashboardLayout role="admin">
      <Outlet />
    </DashboardLayout>
  ),
});
