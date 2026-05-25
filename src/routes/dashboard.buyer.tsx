import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export const Route = createFileRoute("/dashboard/buyer")({
  component: () => (
    <DashboardLayout role="buyer">
      <Outlet />
    </DashboardLayout>
  ),
});
