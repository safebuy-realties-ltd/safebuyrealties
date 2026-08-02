/**
 * The data a public route needs before its HTML is written (E8-S4 criterion 1).
 *
 * `/browse` and `/listings/$listingId` are the only two public pages whose content comes from the
 * API, and until now both of them rendered `Loading…` on the server and filled in afterwards. That
 * is invisible to a crawler that does not run scripts, and it is the difference between a listing
 * page that can be indexed and one that cannot. So the loader fetches, the head is built from what
 * came back, and react-query is handed the same payload as `initialData` so the client does not
 * throw the server's work away and fetch it again on mount.
 *
 * Everything here takes its environment and its `fetch` as arguments. That is what makes it
 * testable: the route file keeps the one line that decides "am I on the server", and every decision
 * worth getting wrong lives in this module where the suite can reach it.
 */

import type { ApiEnvelope } from "@/lib/api";
import { listingIsPubliclyIndexable } from "@/lib/listing-status";
import { resolveServerApiBase } from "@/lib/sitemap";
import type { ListingDto, ListingsQueryOptions } from "@/hooks/use-listings";

/** Where the API listens in local development, the same default `vite.config.ts` proxies to. */
export const SSR_DEV_API_ORIGIN = "http://localhost:3001";

/**
 * How long a server render will wait for the API.
 *
 * A page that renders without its data is a page; a page that waits forever is a timeout. The
 * budget is deliberately short, because missing the deadline costs a crawler-visible body and
 * nothing else: the browser still mounts, still queries, and still fills the page in.
 */
export const SSR_FETCH_TIMEOUT_MS = 2500;

/** The browse page asks for this many listings, and so does the server render in front of it. */
export const BROWSE_PAGE_SIZE = 24;

/**
 * The API base a loader should call, or nothing when there is none to call.
 *
 * `API_PROXY_TARGET` is the variable the Vercel rewrite already uses, so this reads the deployment's
 * own answer rather than introducing a second one that could disagree with it. When it is unset in
 * production the loader stays quiet and the page falls back to fetching in the browser, which is
 * what it did before this story; guessing an origin would be worse than rendering a little less.
 */
export function ssrApiBase(env: Record<string, string | undefined>): string | undefined {
  const configured = env.API_PROXY_TARGET?.trim() || env.SBR_API_PROXY_TARGET?.trim();
  if (!configured && env.NODE_ENV === "production") return undefined;
  return resolveServerApiBase(env, SSR_DEV_API_ORIGIN);
}

/**
 * One API read during a server render. Anything at all going wrong returns nothing, because the
 * caller's fallback is the page it already renders today and a thrown error inside a loader is a
 * 500 on a page that did not need the data to exist.
 */
export async function fetchSsrJson<T>(
  url: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<T | undefined> {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

/**
 * One listing for its detail page.
 *
 * The request carries no cookies, so the API answers as it would to any visitor, and the indexable
 * check is applied again here anyway. Metadata is the one place a leak would be permanent: a title
 * and a JSON-LD block for a draft listing outlive the page they came from.
 */
export async function ssrListing(
  env: Record<string, string | undefined>,
  listingId: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<ListingDto | undefined> {
  const base = ssrApiBase(env);
  if (!base || !listingId.trim()) return undefined;

  const payload = await fetchSsrJson<ApiEnvelope<ListingDto>>(
    `${base}/listings/${encodeURIComponent(listingId)}`,
    fetchImpl,
  );
  const listing = payload?.data;
  if (!listing?.id) return undefined;
  if (!listingIsPubliclyIndexable(listing.status ?? "", listing.isPublished)) return undefined;
  return listing;
}

/**
 * The first page of the marketplace, unfiltered, exactly as `/browse` asks for it on arrival. The
 * envelope is returned whole rather than just its rows, because the page reads `meta.total` and
 * react-query wants the same shape its own `queryFn` would have produced.
 */
export async function ssrBrowseListings(
  env: Record<string, string | undefined>,
  fetchImpl: typeof globalThis.fetch,
): Promise<ApiEnvelope<Array<ListingDto>> | undefined> {
  const base = ssrApiBase(env);
  if (!base) return undefined;

  const payload = await fetchSsrJson<ApiEnvelope<Array<ListingDto>>>(
    `${base}/listings?page=1&pageSize=${BROWSE_PAGE_SIZE}`,
    fetchImpl,
  );
  if (!Array.isArray(payload?.data)) return undefined;
  return payload;
}

/**
 * Whether the query the page is asking for now is the one the server already answered.
 *
 * react-query keys cache entries by these options, and `initialData` is offered per key. Handing the
 * server's unfiltered first page to a filtered query would seed the filtered key with rows that do
 * not match the filter, and the page would show them until the real request came back.
 */
export function isSsrBrowseQuery(options: ListingsQueryOptions | undefined): boolean {
  if (!options) return false;
  return (
    (options.page ?? 1) === 1 &&
    (options.pageSize ?? BROWSE_PAGE_SIZE) === BROWSE_PAGE_SIZE &&
    options.status === undefined &&
    options.sellerId === undefined &&
    options.location === undefined &&
    options.minPrice === undefined &&
    options.maxPrice === undefined &&
    options.buildType === undefined &&
    options.minBeds === undefined
  );
}
