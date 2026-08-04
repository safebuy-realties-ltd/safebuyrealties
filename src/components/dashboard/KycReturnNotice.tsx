import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigateAfterAuth } from "@/lib/auth";
import { kycGateSearch } from "@/lib/kyc-gate";

/**
 * The way back from the KYC screen (E4-S2 criterion 2).
 *
 * A buyer arrives here because something else refused them, and the something else is usually a
 * half-finished purchase. Verifying an identity takes a review by a person, so the useful thing is
 * not only to send them back once they are verified but to let them go back now, before they are,
 * and return when the review lands.
 *
 * It is a component rather than a few lines in the route file so that it can be rendered in a test.
 * `PortalLoginForm` is here for the same reason and does the same thing with the same search param:
 * route files in this repository export nothing but their `Route`.
 */
export function KycReturnNotice({ status, redirect }: { status: string; redirect?: string }) {
  const navigate = useNavigate();
  // Through the same guard the link that sent them here used, because a search param arrives from
  // the URL bar as readily as from our own link, and an unchecked one turns this button into an
  // open redirect off the site.
  const { redirect: returnTo } = kycGateSearch(redirect);
  if (!returnTo) return null;

  const verified = status === "VERIFIED";

  return (
    <div
      data-testid="kyc-return"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]"
    >
      <p className="text-sm text-foreground">
        {verified
          ? "Your identity is verified. You can carry on from where you were."
          : "You were sent here from a step that needs a verified identity."}
      </p>
      <Button
        type="button"
        variant={verified ? "default" : "outline"}
        onClick={() => navigateAfterAuth(navigate, returnTo)}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
        Back to where you left off
      </Button>
    </div>
  );
}
