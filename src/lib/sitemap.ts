/**
 * `robots.txt` and `sitemap.xml` generation (E8-S4).
 *
 * Pure, like `seo.ts` and for the same reason: the two server routes that use this are one call
 * each, so the logic is measured by the frontend suite rather than by nothing.
 *
 * Both files are generated per request rather than committed as static assets. That is not
 * gold-plating, it is what makes them correct on more than one host. A committed `robots.txt` has
 * to hard-code the sitemap URL, so it is either wrong on preview deployments or wrong in
 * production, and it invites every preview build to be crawled under its own hostname. Deriving
 * the origin from the request that asked makes both files self-consistent wherever they are served,
 * and lets a non-canonical host refuse indexing outright.
 */

import { listingIsPubliclyIndexable } from "@/lib/listing-status";
import { PRIVATE_PATH_PREFIXES, SITE_URL, absoluteUrl, canonicalPath } from "@/lib/seo";

export type ChangeFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export type SitemapEntry = {
  path: string;
  lastModified?: string;
  changeFrequency?: ChangeFrequency;
  priority?: number;
};

/**
 * The public routes that exist whether or not anything is listed. Private routes are absent by
 * construction: this list is written by hand rather than walked off the route tree, because a
 * generated list would have put every dashboard route in the sitemap the day it was added.
 */
export const STATIC_SITEMAP_ENTRIES: ReadonlyArray<SitemapEntry> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/browse", changeFrequency: "daily", priority: 0.9 },
  { path: "/due-diligence", changeFrequency: "monthly", priority: 0.8 },
  { path: "/due-diligence/request", changeFrequency: "monthly", priority: 0.7 },
  { path: "/verify", changeFrequency: "monthly", priority: 0.5 },
  { path: "/home/classic", changeFrequency: "monthly", priority: 0.3 },
];

/** The subset of a listing the sitemap reads. Structurally satisfied by `ListingDto`. */
export type SitemapListing = {
  id: string;
  status?: string;
  isPublished?: boolean;
  updatedAt?: string;
};

/** `<lastmod>` wants a W3C date, so anything unparseable is dropped rather than emitted broken. */
export function toLastModified(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/**
 * Criterion 3 says live listings only, and the definition of live is not restated here: it is
 * `listingIsPubliclyIndexable`, which mirrors the rule the API itself applies to anyone without a
 * session. A sitemap that decided for itself what counts as live would start advertising pages that
 * answer 404 to the crawler that followed them.
 */
export function listingSitemapEntries(
  listings: ReadonlyArray<SitemapListing>,
): Array<SitemapEntry> {
  return listings
    .filter((listing) => listingIsPubliclyIndexable(listing.status ?? "", listing.isPublished))
    .map((listing) => ({
      path: `/listings/${listing.id}`,
      lastModified: toLastModified(listing.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
}

/** XML predefined entities. A listing id is a cuid today, but the sitemap does not rely on that. */
export function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** A sitemap URL set, ready to serve. */
export function buildSitemapXml(
  entries: ReadonlyArray<SitemapEntry>,
  origin: string = SITE_URL,
): string {
  const urls = entries.map((entry) => {
    const parts = [`    <loc>${xmlEscape(absoluteUrl(entry.path, origin))}</loc>`];
    if (entry.lastModified) parts.push(`    <lastmod>${xmlEscape(entry.lastModified)}</lastmod>`);
    if (entry.changeFrequency) parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
    if (entry.priority !== undefined) {
      parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
    }
    return `  <url>\n${parts.join("\n")}\n  </url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * `robots.txt`.
 *
 * The disallow list is `PRIVATE_PATH_PREFIXES`, not a second list that looks like it. Criterion 5
 * says every private route is noindex, and that is enforced in three places: this file, the
 * `X-Robots-Tag` header, and the per-route meta. Deriving all three from one array is what keeps
 * the answer the same in all three.
 *
 * `allowIndexing: false` produces a blanket refusal, which is what a preview deployment needs. A
 * preview serves the same pages under a hostname nobody chose, and an indexed preview competes with
 * production for its own content.
 */
export function buildRobotsTxt(options: { origin?: string; allowIndexing?: boolean } = {}): string {
  const origin = options.origin ?? SITE_URL;
  const allowIndexing = options.allowIndexing ?? true;

  if (!allowIndexing) {
    return [
      "# Not the canonical host. Nothing served here should be indexed.",
      "User-agent: *",
      "Disallow: /",
      "",
    ].join("\n");
  }

  // Two rules per prefix, so the file says exactly what `isPrivatePath` says and not something
  // near it. `/login/` alone leaves `/login` itself crawlable; bare `/login` would also cover a
  // future public `/login-help`. The `$` anchor is the Google and Bing extension, and a crawler
  // that does not understand it reads a literal that matches nothing, which leaves the subtree
  // rule doing the work it was already doing.
  const disallow = PRIVATE_PATH_PREFIXES.flatMap((prefix) => {
    const path = canonicalPath(prefix);
    return [`Disallow: ${path}$`, `Disallow: ${path}/`];
  });

  return [
    "# SafeBuyRealties",
    "# Private routes are behind a session; they are listed here as well as sent noindex,",
    "# because robots.txt stops the request and the header only answers one that happened.",
    "User-agent: *",
    ...disallow,
    "Allow: /",
    "",
    `Sitemap: ${absoluteUrl("/sitemap.xml", origin)}`,
    "",
  ].join("\n");
}

/**
 * The origin a request was actually served on, so `robots.txt` and `sitemap.xml` name the host the
 * caller used. Behind Vercel the client-facing values are the forwarded headers; `host` alone is
 * the internal one.
 */
export function originFromRequest(request: { url: string; headers: Headers }): string {
  const headers = request.headers;
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host")?.trim();
  if (!host) return SITE_URL;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme =
    proto || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${scheme}://${host}`;
}

/** Whether this origin is the one canonical URLs point at, and so the one that may be indexed. */
export function isCanonicalOrigin(origin: string, canonical: string = SITE_URL): boolean {
  try {
    return new URL(origin).host === new URL(canonical).host;
  } catch {
    return false;
  }
}

/**
 * Where the sitemap route fetches listings from.
 *
 * Server-side there is no same-origin proxy to lean on: `/api/v1` is a Vercel rewrite performed in
 * front of this process, so a relative fetch from inside it resolves to nothing. `API_PROXY_TARGET`
 * is the value that rewrite already uses, which makes it the API base rather than a new variable
 * somebody has to remember to set. Falling back to the request's own origin still works, at the
 * cost of a hop back out through the rewrite, and that is the local-dev path.
 */
export function resolveServerApiBase(
  env: Record<string, string | undefined>,
  requestOrigin: string,
): string {
  const configured = env.API_PROXY_TARGET?.trim() || env.SBR_API_PROXY_TARGET?.trim();
  let base = configured || requestOrigin;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return `${base}/api/v1`;
}

/**
 * How many listings one request asks for, and the ceiling on how many are walked in total.
 *
 * The page size is not a preference. `ListListingsQueryDto` in the backend carries `@Max(100)` on
 * `pageSize`, so asking for more is a 400, and `fetchSitemapListings` treats a refusal as an empty
 * catalogue by design. Raising this number does not fetch more listings, it fetches none.
 */
export const SITEMAP_PAGE_SIZE = 100;
export const SITEMAP_MAX_LISTINGS = 5000;

/** An hour. Long enough that crawlers are not the reason the API is busy, short enough to matter. */
export const SITEMAP_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";
export const ROBOTS_CACHE_CONTROL = "public, max-age=3600";

/** The shape the request handlers need from the runtime, passed in rather than reached for. */
export type SitemapRuntime = {
  env: Record<string, string | undefined>;
  fetch: typeof globalThis.fetch;
};

/**
 * Every listing the sitemap might name, paged.
 *
 * The catalogue is small today and `SITEMAP_MAX_LISTINGS` is far above it, but a loop with no
 * ceiling is a loop that pages forever the day the API returns a wrong `total`. Anything the API
 * refuses or garbles produces an empty list rather than a throw, because a sitemap missing its
 * listings is a worse day than a sitemap route returning 500, and the caller degrades to the static
 * entries either way.
 */
export async function fetchSitemapListings(
  apiBase: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<Array<SitemapListing>> {
  const listings: Array<SitemapListing> = [];
  let page = 1;

  while (listings.length < SITEMAP_MAX_LISTINGS) {
    let payload: { data?: Array<SitemapListing>; meta?: { total?: number } };
    try {
      const response = await fetchImpl(
        `${apiBase}/listings?page=${page}&pageSize=${SITEMAP_PAGE_SIZE}`,
        { headers: { accept: "application/json" } },
      );
      if (!response.ok) break;
      payload = (await response.json()) as typeof payload;
    } catch {
      break;
    }

    const batch = payload.data;
    if (!Array.isArray(batch) || batch.length === 0) break;
    listings.push(...batch);

    const total = payload.meta?.total;
    if (batch.length < SITEMAP_PAGE_SIZE) break;
    if (typeof total === "number" && listings.length >= total) break;
    page += 1;
  }

  return listings.slice(0, SITEMAP_MAX_LISTINGS);
}

/**
 * `GET /sitemap.xml`.
 *
 * A non-canonical host gets the static pages and no listings. It is already telling crawlers not to
 * index it in `robots.txt`, and there is no reason for a preview deployment to ask the API for the
 * whole catalogue every time something scans it.
 */
export async function sitemapResponse(
  request: Request,
  runtime: SitemapRuntime,
): Promise<Response> {
  const origin = originFromRequest(request);
  const entries: Array<SitemapEntry> = [...STATIC_SITEMAP_ENTRIES];

  if (isCanonicalOrigin(origin)) {
    const apiBase = resolveServerApiBase(runtime.env, origin);
    entries.push(...listingSitemapEntries(await fetchSitemapListings(apiBase, runtime.fetch)));
  }

  return new Response(buildSitemapXml(entries, origin), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": SITEMAP_CACHE_CONTROL,
    },
  });
}

/** `GET /robots.txt`. Indexing is offered to the canonical host and refused to every other one. */
export function robotsResponse(request: Request): Response {
  const origin = originFromRequest(request);
  return new Response(buildRobotsTxt({ origin, allowIndexing: isCanonicalOrigin(origin) }), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": ROBOTS_CACHE_CONTROL,
    },
  });
}
