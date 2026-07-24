import { createFileRoute } from "@tanstack/react-router";
import { PortalLoginForm } from "@/components/auth/PortalLoginForm";

type LoginSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/login/admin")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const { redirect } = Route.useSearch();

  return (
    <PortalLoginForm
      portal="admin"
      title="Platform staff sign in"
      subtitle="For SafeBuyRealties staff and administrators — not for buyers, sellers, or external professionals."
      heroTitle="Operations & platform administration."
      heroSubtitle="Review submissions, manage users and listings, and oversee due diligence workflows."
      redirect={redirect}
    />
  );
}
