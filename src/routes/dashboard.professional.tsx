import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useMyProfileQuery, isProfessionalProfileComplete } from "@/hooks/use-professional-profile";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard/professional")({
  component: ProfessionalDashboardLayout,
});

function ProfessionalDashboardLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isReady, isAuthenticated } = useAuth();
  const { data: profile, isLoading } = useMyProfileQuery();

  useEffect(() => {
    if (!isReady || !isAuthenticated || user?.role !== "professional" || isLoading) return;
    const isIndex = pathname === "/dashboard/professional" || pathname === "/dashboard/professional/";
    const needsOnboarding =
      !profile || (profile.verifiedStatus !== "VERIFIED" && !isProfessionalProfileComplete(profile));
    if (isIndex && needsOnboarding) {
      navigate({ to: "/onboarding/professional" });
    }
  }, [isAuthenticated, isLoading, isReady, navigate, pathname, profile, user?.role]);

  return (
    <DashboardLayout role="professional">
      <Outlet />
    </DashboardLayout>
  );
}
