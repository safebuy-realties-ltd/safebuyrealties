import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { PoaVerifyResult } from "@/components/PoaVerifyResult";
import { SiteHeader } from "@/components/SiteHeader";
import { useVerifyPoaQuery } from "@/hooks/use-poa";
import { seoHead } from "@/lib/seo";

/**
 * This page used to carry a hand-written head with the origin spelled out in it, which is how the
 * canonical here came to name a different host from the rest of the site. The origin now comes from
 * `VITE_SITE_URL` like every other route, and it has to match the backend's `POA_VERIFY_BASE_URL`
 * (backend/.env.example) because that is the URL a printed QR code sends people to.
 */
const PAGE_DESCRIPTION =
  "Check a SafeBuyRealties Power of Attorney against the register. Enter or scan the document hash to confirm the property and the date it was executed.";

type VerifySearch = {
  hash?: string;
};

export const Route = createFileRoute("/verify")({
  component: VerifyPage,
  validateSearch: (search: Record<string, unknown>): VerifySearch => {
    const raw = typeof search.hash === "string" ? search.hash.trim() : "";
    return raw ? { hash: raw } : {};
  },
  head: () =>
    seoHead({
      title: "Verify a Power of Attorney",
      description: PAGE_DESCRIPTION,
      path: "/verify",
    }),
});

function VerifyPage() {
  const { hash } = Route.useSearch();
  const { data, isLoading, isError } = useVerifyPoaQuery(hash ?? null);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 text-primary">
            <ShieldCheck className="h-6 w-6" aria-hidden />
            <span className="text-lg font-semibold">SafeBuyRealties</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Power of Attorney verification
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Anyone can check a document here. No account is required.
          </p>
        </header>

        <PoaVerifyResult
          hash={hash}
          isLoading={Boolean(hash) && isLoading}
          isError={isError}
          data={data}
        />
      </main>
    </div>
  );
}
