import { createFileRoute } from "@tanstack/react-router";
import { PortalLoginForm } from "@/components/auth/PortalLoginForm";

type LoginSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/login/buyer")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: BuyerLoginPage,
});

function BuyerLoginPage() {
  const { redirect } = Route.useSearch();

  return (
    <PortalLoginForm
      portal="buyer"
      title="Buyer sign in"
      subtitle="Browse verified listings, track due diligence, and complete purchases securely."
      registerRole="buyer"
      heroTitle="Find your next home with confidence."
      heroSubtitle="Access saved properties, transaction history, and due diligence reports from your buyer workspace."
      redirect={redirect}
    />
  );
}
