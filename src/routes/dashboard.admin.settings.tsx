import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/admin/settings")({
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  return (
    <>
      <PageHeader
        title="Platform settings"
        description="VAT rate, upload limits, and payment provider toggles ship in Step 2 platform configuration."
      />
      <div className="rounded-xl border border-border/60 bg-card p-6 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
        <p>
          This screen is a placeholder until the platform-config API and admin PATCH flow are
          implemented. Use environment variables on Vercel for production limits today.
        </p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link to="/dashboard/admin">Back to overview</Link>
        </Button>
      </div>
    </>
  );
}
