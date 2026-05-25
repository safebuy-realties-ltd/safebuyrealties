import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export const Route = createFileRoute("/dashboard/seller")({
  component: () => (
    <DashboardLayout role="seller">
      <Outlet />
    </DashboardLayout>
  ),
});
