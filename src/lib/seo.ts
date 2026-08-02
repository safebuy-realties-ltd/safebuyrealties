/**
 * Per-route metadata for the public web surface (E8-S4).
 *
 * Everything here is pure. Route files call one of these and nothing else, which is deliberate:
 * `vitest.config.ts` measures coverage over all of `src/**`, so a route file that grows logic
 * grows untested lines and `scripts/diff-coverage.mjs` fails the pull request. Logic lives here,
 * where it is tested; the call site in a route is one line.
 *
 * Two facts about how TanStack merges head output drove the shape of this module, both read out of
 * `@tanstack/react-router/dist/esm/headContentUtils.js` rather than guessed:
 *
 * 1. `meta` is walked from the deepest match outwards and the first entry wins per `name` or
 *    `property`, and for `title`. So a route overrides the root simply by emitting the same key.
 * 2. `links` are NOT deduped that way. They are concatenated and deduped only by whole-object
 *    equality. A canonical in `__root.tsx` plus a canonical in a route is two `rel="canonical"`
 *    tags on one page, which is worse than none. **Canonical belongs to leaf routes only** and
 *    that is why `__root.tsx` sets no canonical and `seoHead` is the only thing that emits one.
 */

import type * as React from "react";

/** Brand name, used to suffix titles and as `og:site_name`. */
export const SITE_NAME = "SafeBuyRealties";

/**
 * Canonical origin when `VITE_SITE_URL` is unset. The production frontend is the Vercel project
 * named in `backend/.env.example`; the API's CORS allowlist is keyed to the same host.
 */
export const DEFAULT_SITE_URL = "https://safebuyrealties-app.vercel.app";

/** Root title. Unchanged shipped copy, kept verbatim so this story moves plumbing and not wording. */
export const DEFAULT_TITLE = "SafeBuyRealties — Verified Real Estate Transactions";

export const DEFAULT_DESCRIPTION =
  "Verified listings, secure transactions, and professional validation for confident real estate buying and selling.";

/**
 * Share image. Hosted off-platform by the original page builder, which is a dependency on somebody
 * else's bucket rather than a decision anybody made. Left as it is because it works today and
 * swapping it needs a designed 1200x630 asset, not a code change. One constant to edit when there
 * is one.
 */
export const DEFAULT_OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d0bcce2c-5564-441a-b0e0-34ad9b6bdb7f/id-preview-0e8055c3--90c89557-f2c9-4869-ba90-0bc8476a4c61.lovable.app-1777658280743.png";

export const INDEXABLE = "index, follow";
export const NOT_INDEXABLE = "noindex, nofollow";

/** Longest meta description before search engines truncate it. */
export const DESCRIPTION_MAX = 160;

/** Characters a truncated description must not end on, before the ellipsis is added. */
const TRAILING_PUNCTUATION = ",;:. \t\n";

export type MetaTag =
  | { title: string }
  | { charSet: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { "script:ld+json": Record<string, unknown> };

export type LinkTag = { rel: string; href: string };

/**
 * What a route's `head` is allowed to hand back for `meta`.
 *
 * The React adapter types the field as React's own `<meta>` props (`RouteMatchExtensions` in
 * `@tanstack/react-router/dist/esm/Matches.d.ts`), which leaves no room for a `script:ld+json`
 * entry. The runtime disagrees: `headContentUtils.js` reads that key and writes a JSON-LD script
 * tag, and router-core's own `MetaDescriptor` lists it. So the two are out of step on paper while
 * agreeing in practice, and criterion 4 needs the key that only the runtime knows about.
 *
 * The widening happens here and nowhere else. A route file calls one function and gets something
 * its `head` accepts, rather than carrying a cast of its own that nobody would revisit when the
 * published types catch up.
 */
export type HeadMeta = React.JSX.IntrinsicElements["meta"];

function toHeadMeta(meta: Array<MetaTag>): Array<HeadMeta> {
  return meta as unknown as Array<HeadMeta>;
}

export type HeadResult = { meta: Array<HeadMeta>; links: Array<LinkTag> };

/**
 * Reduce anything to a bare `scheme://host` origin, or fall back to the default.
 *
 * A configured value arrives from an environment variable, so it can be blank, carry a path, carry
 * a trailing slash or omit the scheme. All four are the same origin and none of them should produce
 * a broken canonical.
 */
export function normalizeSiteUrl(raw: string | undefined | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_SITE_URL;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.host) return DEFAULT_SITE_URL;
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** The origin every canonical on this deployment points at. */
export const SITE_URL = normalizeSiteUrl(import.meta.env.VITE_SITE_URL);

/**
 * One URL per page. Query strings and fragments are dropped, duplicate slashes collapse and a
 * trailing slash goes, so `/browse`, `/browse/`, `//browse` and `/browse?page=2` all canonicalise
 * to `/browse` and a crawler is told they are one page rather than four.
 */
export function canonicalPath(pathname: string): string {
  const withoutFragment = pathname.split("#")[0] ?? "";
  const withoutQuery = withoutFragment.split("?")[0] ?? "";
  // Runs of slashes are already one slash by here, so at most one can be trailing.
  const collapsed = withoutQuery.replace(/\/{2,}/g, "/");
  const trimmed = collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** Absolute URL for a route path, which is what canonical and `og:url` both require. */
export function absoluteUrl(path: string, origin: string = SITE_URL): string {
  return `${normalizeSiteUrl(origin)}${canonicalPath(path)}`;
}

/** `Page | SafeBuyRealties`, unless the page title already carries the brand. */
export function pageTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return DEFAULT_TITLE;
  return trimmed.includes(SITE_NAME) ? trimmed : `${trimmed} | ${SITE_NAME}`;
}

/**
 * Fit a description into the space a result page gives it, cutting on a word boundary. A
 * description sliced mid-word reads as machine output and is the first thing a person sees.
 */
export function truncateDescription(text: string, max: number = DESCRIPTION_MAX): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  const window = collapsed.slice(0, max - 1);
  const lastSpace = window.lastIndexOf(" ");
  let cut = lastSpace > max / 2 ? window.slice(0, lastSpace) : window;
  while (cut.length > 0 && TRAILING_PUNCTUATION.includes(cut.at(-1) as string)) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

export type SeoInput = {
  title: string;
  description: string;
  /** Route path, not a full URL. The origin is added here so every caller cannot get it wrong. */
  path: string;
  image?: string;
  type?: "website" | "article" | "product";
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
  origin?: string;
};

/**
 * The full metadata block for one public route: title, description, canonical, Open Graph and
 * Twitter, and optionally JSON-LD. Emitting all of them together is the point, because the failure
 * mode of per-route metadata is a page that sets a title and forgets `og:title`, and then shares
 * on social with the site-wide default.
 */
export function seoHead(input: SeoInput): HeadResult {
  const title = pageTitle(input.title);
  const description = truncateDescription(input.description);
  const url = absoluteUrl(input.path, input.origin ?? SITE_URL);
  const image = input.image ?? DEFAULT_OG_IMAGE;

  const meta: Array<MetaTag> = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: input.noindex ? NOT_INDEXABLE : INDEXABLE },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
  if (input.jsonLd) meta.push({ "script:ld+json": input.jsonLd });

  return { meta: toHeadMeta(meta), links: [{ rel: "canonical", href: url }] };
}

/**
 * Keep a route out of the index. No canonical, deliberately: a canonical is a request to index one
 * URL rather than another, and these pages are asking not to be indexed at all.
 *
 * `googlebot` is set alongside `robots` because the two are read independently and the specific one
 * wins, so a page that only sets `robots` can still be indexed by a crawler honouring the other.
 */
export function noindexHead(title?: string): HeadResult {
  const meta: Array<MetaTag> = [
    { name: "robots", content: NOT_INDEXABLE },
    { name: "googlebot", content: NOT_INDEXABLE },
  ];
  if (title) meta.push({ title: pageTitle(title) });
  return { meta: toHeadMeta(meta), links: [] };
}

/**
 * Route prefixes that must never be indexed: everything behind a session, plus the pages that take
 * credentials. `robots.txt` disallows exactly this list, and `isPrivatePath` answers for the
 * `X-Robots-Tag` header, so the three cannot drift apart.
 */
export const PRIVATE_PATH_PREFIXES = [
  "/dashboard",
  "/login",
  "/register",
  "/checkout",
  "/purchase",
  "/onboarding",
  "/activate",
  "/api",
] as const;

/** Whether a path is behind a session or takes credentials, and so must not be indexed. */
export function isPrivatePath(pathname: string): boolean {
  const path = canonicalPath(pathname);
  return PRIVATE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * The path of the deepest route that matched, which is the page the reader is on. `matches` runs
 * outermost first, so the last entry is the leaf. An empty array means the router has not matched
 * anything yet, and the root is the honest answer for that.
 */
export function deepestPathname(matches: ReadonlyArray<{ pathname: string }> | undefined): string {
  return matches?.at(-1)?.pathname ?? "/";
}

/**
 * The site-wide meta block, and the whole of criterion 5.
 *
 * Indexing is decided here, once, from the path, rather than by adding a `noindex` line to each
 * private route. Forty-odd dashboard routes exist today and the next one is written next week; a
 * per-route opt-out is a list somebody eventually forgets to add to, and the failure is silent
 * because nothing goes wrong until a dashboard turns up in a search result. Deciding at the root
 * inverts it: a route is out of the index unless its path says otherwise, and a public route opts
 * back in by emitting `robots` itself through `seoHead`. The deepest match wins that key, so the
 * leaf's `index, follow` beats this, and nothing else needs to know.
 */
export function rootMeta(pathname: string): Array<HeadMeta> {
  const priv = isPrivatePath(pathname);
  const meta: Array<MetaTag> = [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title: DEFAULT_TITLE },
    { name: "description", content: DEFAULT_DESCRIPTION },
    { name: "robots", content: priv ? NOT_INDEXABLE : INDEXABLE },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: DEFAULT_TITLE },
    { property: "og:description", content: DEFAULT_DESCRIPTION },
    { property: "og:type", content: "website" },
    { property: "og:image", content: DEFAULT_OG_IMAGE },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: DEFAULT_TITLE },
    { name: "twitter:description", content: DEFAULT_DESCRIPTION },
    { name: "twitter:image", content: DEFAULT_OG_IMAGE },
  ];
  // Only on the private branch. `googlebot` overrides `robots` for the crawler that reads it, so
  // setting it site-wide would let this file override a public route's own `index, follow` for
  // exactly the crawler that matters most.
  if (priv) meta.push({ name: "googlebot", content: NOT_INDEXABLE });
  return toHeadMeta(meta);
}

/**
 * The `X-Robots-Tag` value for a request, or nothing when the page may be indexed.
 *
 * A header rather than only meta, because meta is in the HTML and a crawler that fetched a PDF, a
 * JSON response or a redirect never sees it. It is the same decision as `rootMeta` makes, from the
 * same predicate, so the two cannot disagree.
 */
export function robotsTagFor(pathname: string): string | undefined {
  return isPrivatePath(pathname) ? NOT_INDEXABLE : undefined;
}

/** The subset of a listing this module needs. Structurally satisfied by `ListingDto`. */
export type SeoListing = {
  id: string;
  title: string;
  description?: string | null;
  location: string;
  price?: string | null;
  currency?: string | null;
  status?: string;
  isPublished?: boolean;
  beds?: number | null;
  baths?: number | null;
  landAreaSqm?: number | null;
  propertyType?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export function listingPath(listingId: string): string {
  return `/listings/${listingId}`;
}

/** `Three bedroom duplex in Lekki`, or just the title when there is no location to add. */
export function listingTitle(listing: SeoListing): string {
  const name = listing.title.trim();
  const where = listing.location?.trim();
  if (!where || name.toLowerCase().includes(where.toLowerCase())) return name;
  return `${name} in ${where}`;
}

/**
 * Prefer the seller's own description. When there is none, say something true from the specs rather
 * than repeat the site-wide description on every listing, because identical descriptions across
 * pages are read as duplicate content.
 */
export function listingDescription(listing: SeoListing): string {
  const own = listing.description?.replace(/\s+/g, " ").trim();
  if (own) return truncateDescription(own);

  const specs: Array<string> = [];
  if (listing.beds) specs.push(`${listing.beds} bed`);
  if (listing.baths) specs.push(`${listing.baths} bath`);
  if (listing.landAreaSqm) specs.push(`${listing.landAreaSqm} sqm`);
  const detail = specs.length ? `${specs.join(", ")}. ` : "";
  return truncateDescription(
    `${listingTitle(listing)}. ${detail}Title checks, survey validation and escrow-ready transaction on ${SITE_NAME}.`,
  );
}

/**
 * schema.org availability. `UNDER_OFFER` is still a live page and still publicly viewable, and
 * saying so is more honest than `InStock` on something that is halfway sold.
 */
export function listingAvailability(status: string | undefined): string {
  return status === "UNDER_OFFER"
    ? "https://schema.org/LimitedAvailability"
    : "https://schema.org/InStock";
}

/**
 * `propertyType` is a free-text column rather than a Prisma enum, so this maps what the product
 * actually stores and falls back to the generic type instead of inventing one.
 */
export function residenceType(propertyType: string | null | undefined): string {
  const key = propertyType
    ?.trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  switch (key) {
    case "APARTMENT":
    case "FLAT":
      return "Apartment";
    case "HOUSE":
    case "DUPLEX":
    case "BUNGALOW":
    case "DETACHED":
    case "SEMI_DETACHED":
    case "TERRACE":
      return "SingleFamilyResidence";
    case "LAND":
    case "PLOT":
      return "Place";
    default:
      return "Residence";
  }
}

/**
 * `RealEstateListing` structured data for a listing detail page.
 *
 * Keys are omitted rather than set to null when the data is missing. A structured-data block that
 * declares `"numberOfBedrooms": null` is a claim about the property, and a wrong one.
 */
export function listingJsonLd(
  listing: SeoListing,
  origin: string = SITE_URL,
): Record<string, unknown> {
  const url = absoluteUrl(listingPath(listing.id), origin);

  const address: Record<string, unknown> = { "@type": "PostalAddress", addressCountry: "NG" };
  if (listing.location?.trim()) address.addressLocality = listing.location.trim();

  const about: Record<string, unknown> = {
    "@type": residenceType(listing.propertyType),
    name: listing.title,
    address,
  };
  if (listing.beds) about.numberOfBedrooms = listing.beds;
  if (listing.baths) about.numberOfBathroomsTotal = listing.baths;
  if (listing.landAreaSqm) {
    about.floorSize = {
      "@type": "QuantitativeValue",
      value: listing.landAreaSqm,
      unitCode: "MTK",
    };
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listingTitle(listing),
    description: listingDescription(listing),
    url,
    about,
  };
  if (listing.createdAt) jsonLd.datePosted = listing.createdAt;

  const price = Number(listing.price);
  if (listing.price && Number.isFinite(price)) {
    jsonLd.offers = {
      "@type": "Offer",
      price: listing.price,
      priceCurrency: listing.currency ?? "NGN",
      availability: listingAvailability(listing.status),
      url,
    };
  }

  return jsonLd;
}

/** Everything a listing detail page puts in its head, in one call. */
export function listingHead(listing: SeoListing, origin: string = SITE_URL): HeadResult {
  return seoHead({
    title: listingTitle(listing),
    description: listingDescription(listing),
    path: listingPath(listing.id),
    type: "article",
    origin,
    jsonLd: listingJsonLd(listing, origin),
  });
}

/**
 * The head for the listing route, including the case where the server render came back with no
 * listing: the API was unreachable, or the id belongs to something that is not public.
 *
 * There is no honest title to invent without the listing, so the page keeps the site-wide defaults
 * the root already emits and gets only its canonical. The canonical is still correct either way,
 * because it is a statement about which URL this page is, not about what happens to be on it, and
 * leaving it off would let the page be indexed under whatever query string somebody linked.
 */
export function listingRouteHead(
  listingId: string,
  listing: SeoListing | undefined,
  origin: string = SITE_URL,
): HeadResult {
  if (listing) return listingHead(listing, origin);
  return {
    meta: [],
    links: [{ rel: "canonical", href: absoluteUrl(listingPath(listingId), origin) }],
  };
}
