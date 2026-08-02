import { createFileRoute } from "@tanstack/react-router";
import { sitemapResponse } from "@/lib/sitemap";

/**
 * `/sitemap.xml` (E8-S4 criterion 3).
 *
 * The runtime is handed in rather than read inside the module so the generator is testable without
 * a server: `process.env` names the API the Vercel rewrite already points at, and `fetch` is the
 * one thing here that talks to it.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => sitemapResponse(request, { env: process.env, fetch }),
    },
  },
});
