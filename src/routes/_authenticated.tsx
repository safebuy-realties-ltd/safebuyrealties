import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30">
        <div className="text-sm text-muted-foreground">Redirecting to sign in…</div>
      </div>
    );
  }

  return <Outlet />;
}
