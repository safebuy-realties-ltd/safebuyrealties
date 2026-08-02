import { createFileRoute } from "@tanstack/react-router";
import { robotsResponse } from "@/lib/sitemap";

/**
 * `/robots.txt` (E8-S4 criterion 3).
 *
 * A server route rather than a file in `public/`, because the body depends on the host that asked:
 * the `Sitemap:` line has to be absolute, and a preview deployment has to be able to answer
 * "Disallow: /" under its own hostname. The filename escapes its dot the way the route generator
 * documents, so this file is the path `/robots.txt` and not a segment called `txt`.
 */
export const Route = createFileRoute("/robots.txt")({
  server: { handlers: { GET: ({ request }) => robotsResponse(request) } },
});
