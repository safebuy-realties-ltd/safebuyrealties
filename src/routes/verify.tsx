import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { PoaVerifyResult } from "@/components/PoaVerifyResult";
import { SiteHeader } from "@/components/SiteHeader";
import { useVerifyPoaQuery } from "@/hooks/use-poa";

/**
 * Public origin this page is served from. Keep in step with the backend's
 * POA_VERIFY_BASE_URL (backend/.env.example), which is what QR codes encode.
 */
const CANONICAL_URL = "https://safebuyrealties.com/verify";

const PAGE_TITLE = "Verify a Power of Attorney — SafeBuyRealties";
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
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:url", content: CANONICAL_URL },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: CANONICAL_URL }],
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
