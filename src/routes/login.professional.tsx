import { createFileRoute } from "@tanstack/react-router";
import { PortalLoginForm } from "@/components/auth/PortalLoginForm";

type LoginSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/login/professional")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: ProfessionalLoginPage,
});

function ProfessionalLoginPage() {
  const { redirect } = Route.useSearch();

  return (
    <PortalLoginForm
      portal="professional"
      title="Professional sign in"
      subtitle="For lawyers, surveyors, valuers, and other licensed experts on the platform."
      registerRole="professional"
      heroTitle="Licensed experts. Verified work."
      heroSubtitle="Review assigned tasks, submit credentials, and support due diligence for verified transactions."
      redirect={redirect}
    />
  );
}
