import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export const Route = createFileRoute("/dashboard/super-admin")({
  component: () => (
    <DashboardLayout role="super_admin">
      <Outlet />
    </DashboardLayout>
  ),
});
