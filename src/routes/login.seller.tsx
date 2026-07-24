import { createFileRoute } from "@tanstack/react-router";
import { PortalLoginForm } from "@/components/auth/PortalLoginForm";

type LoginSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/login/seller")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: SellerLoginPage,
});

function SellerLoginPage() {
  const { redirect } = Route.useSearch();

  return (
    <PortalLoginForm
      portal="seller"
      title="Property owner & agent sign in"
      subtitle="For property owners and registered real estate agents listing on SafeBuyRealties."
      registerRole="seller"
      heroTitle="List with verification. Close with trust."
      heroSubtitle="Manage listings, upload documents, and collaborate with buyers and professionals from your seller workspace."
      redirect={redirect}
    />
  );
}
