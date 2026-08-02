import { describe, expect, it } from "vitest";
import {
  DEFAULT_OG_IMAGE,
  DEFAULT_SITE_URL,
  DEFAULT_TITLE,
  NOT_INDEXABLE,
  INDEXABLE,
  PRIVATE_PATH_PREFIXES,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  canonicalPath,
  isPrivatePath,
  listingAvailability,
  listingDescription,
  listingHead,
  listingJsonLd,
  listingPath,
  listingRouteHead,
  listingTitle,
  noindexHead,
  normalizeSiteUrl,
  pageTitle,
  residenceType,
  seoHead,
  truncateDescription,
  type HeadMeta,
  type SeoListing,
} from "@/lib/seo";

const ORIGIN = "https://example.test";

/**
 * The head helpers hand back `HeadMeta`, which is React's own `<meta>` prop type: every field is
 * optional and `script:ld+json` is not among them. So these three read the tags the way the router
 * does at runtime, through a plain record, rather than through the published type.
 */
function asRecords(meta: Array<HeadMeta>): Array<Record<string, unknown>> {
  return meta as unknown as Array<Record<string, unknown>>;
}

function metaValue(meta: Array<HeadMeta>, key: string): string | undefined {
  for (const record of asRecords(meta)) {
    if (record.name === key || record.property === key) return record.content as string;
  }
  return undefined;
}

function titleOf(meta: Array<HeadMeta>): string | undefined {
  const found = asRecords(meta).find((tag) => "title" in tag);
  return found?.title as string | undefined;
}

function jsonLdOf(meta: Array<HeadMeta>): Record<string, unknown> | undefined {
  const found = asRecords(meta).find((tag) => "script:ld+json" in tag);
  return found?.["script:ld+json"] as Record<string, unknown> | undefined;
}

const LISTING: SeoListing = {
  id: "listing-1",
  title: "Four bedroom duplex",
  description: "A finished duplex with registered title and a completed survey.",
  location: "Lekki",
  price: "185000000",
  currency: "NGN",
  status: "LIVE",
  isPublished: true,
  beds: 4,
  baths: 5,
  landAreaSqm: 450,
  propertyType: "DUPLEX",
  createdAt: "2026-01-04T09:00:00.000Z",
  updatedAt: "2026-02-01T09:00:00.000Z",
};

describe("normalizeSiteUrl", () => {
  it("falls back to the default when the value is missing or blank", () => {
    expect(normalizeSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl(null)).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl("   ")).toBe(DEFAULT_SITE_URL);
  });

  it("adds a scheme when the value is a bare host", () => {
    expect(normalizeSiteUrl("app.safebuyrealties.com")).toBe("https://app.safebuyrealties.com");
  });

  it("reduces a full URL to its origin", () => {
    expect(normalizeSiteUrl("https://app.test/browse?page=2#top")).toBe("https://app.test");
    expect(normalizeSiteUrl("https://app.test/")).toBe("https://app.test");
  });

  it("keeps http, which is what local development serves", () => {
    expect(normalizeSiteUrl("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("falls back rather than emit a broken canonical", () => {
    expect(normalizeSiteUrl("https://")).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl("::::")).toBe(DEFAULT_SITE_URL);
  });

  it("resolves SITE_URL to a usable origin", () => {
    expect(SITE_URL).toMatch(/^https?:\/\/[^/]+$/);
  });
});

describe("canonicalPath", () => {
  it("collapses the four ways of writing one page into one", () => {
    expect(canonicalPath("/browse")).toBe("/browse");
    expect(canonicalPath("/browse/")).toBe("/browse");
    expect(canonicalPath("//browse")).toBe("/browse");
    expect(canonicalPath("/browse?page=2")).toBe("/browse");
    expect(canonicalPath("/browse#results")).toBe("/browse");
  });

  it("keeps the root as a single slash", () => {
    expect(canonicalPath("/")).toBe("/");
    expect(canonicalPath("")).toBe("/");
    expect(canonicalPath("///")).toBe("/");
  });

  it("adds the leading slash a relative path is missing", () => {
    expect(canonicalPath("browse")).toBe("/browse");
  });

  it("leaves nested paths intact", () => {
    expect(canonicalPath("/due-diligence/request/")).toBe("/due-diligence/request");
  });
});

describe("absoluteUrl", () => {
  it("joins an origin to a canonical path", () => {
    expect(absoluteUrl("/browse/", ORIGIN)).toBe("https://example.test/browse");
    expect(absoluteUrl("/", ORIGIN)).toBe("https://example.test/");
  });

  it("normalises an origin that carries a path or a trailing slash", () => {
    expect(absoluteUrl("/browse", "https://example.test/")).toBe("https://example.test/browse");
  });
});

describe("pageTitle", () => {
  it("suffixes the brand", () => {
    expect(pageTitle("Browse verified properties")).toBe(
      `Browse verified properties | ${SITE_NAME}`,
    );
  });

  it("does not repeat a brand the title already carries", () => {
    expect(pageTitle(DEFAULT_TITLE)).toBe(DEFAULT_TITLE);
  });

  it("falls back to the default title when given nothing", () => {
    expect(pageTitle("   ")).toBe(DEFAULT_TITLE);
  });
});

describe("truncateDescription", () => {
  it("leaves a short description alone and collapses its whitespace", () => {
    expect(truncateDescription("  Two   lines\nof copy ")).toBe("Two lines of copy");
  });

  it("cuts on a word boundary and marks the cut", () => {
    const long = `${"word ".repeat(60)}end`;
    const out = truncateDescription(long);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("wor…");
  });

  it("strips punctuation left dangling before the ellipsis", () => {
    const out = truncateDescription(`${"alpha, ".repeat(40)}omega`);
    expect(out).not.toContain(",…");
  });

  it("cuts hard when there is no word boundary to cut on", () => {
    const out = truncateDescription("x".repeat(400), 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("seoHead", () => {
  const head = seoHead({
    title: "Browse verified properties",
    description: "Explore live listings with title checks and survey validation.",
    path: "/browse",
    origin: ORIGIN,
  });

  it("sets one canonical and nothing else in links", () => {
    expect(head.links).toEqual([{ rel: "canonical", href: "https://example.test/browse" }]);
  });

  it("carries the same title through title, og:title and twitter:title", () => {
    const expected = `Browse verified properties | ${SITE_NAME}`;
    expect(titleOf(head.meta)).toBe(expected);
    expect(metaValue(head.meta, "og:title")).toBe(expected);
    expect(metaValue(head.meta, "twitter:title")).toBe(expected);
  });

  it("carries the same description through all three description tags", () => {
    const expected = "Explore live listings with title checks and survey validation.";
    expect(metaValue(head.meta, "description")).toBe(expected);
    expect(metaValue(head.meta, "og:description")).toBe(expected);
    expect(metaValue(head.meta, "twitter:description")).toBe(expected);
  });

  it("points og:url at the canonical rather than at whatever URL was requested", () => {
    expect(metaValue(head.meta, "og:url")).toBe("https://example.test/browse");
  });

  it("is indexable by default and defaults the share image", () => {
    expect(metaValue(head.meta, "robots")).toBe(INDEXABLE);
    expect(metaValue(head.meta, "og:image")).toBe(DEFAULT_OG_IMAGE);
    expect(metaValue(head.meta, "twitter:image")).toBe(DEFAULT_OG_IMAGE);
    expect(metaValue(head.meta, "twitter:card")).toBe("summary_large_image");
    expect(metaValue(head.meta, "og:site_name")).toBe(SITE_NAME);
    expect(metaValue(head.meta, "og:type")).toBe("website");
  });

  it("takes an explicit type, image and noindex", () => {
    const custom = seoHead({
      title: "A",
      description: "B",
      path: "/a",
      origin: ORIGIN,
      type: "article",
      image: "https://cdn.test/a.png",
      noindex: true,
    });
    expect(metaValue(custom.meta, "og:type")).toBe("article");
    expect(metaValue(custom.meta, "og:image")).toBe("https://cdn.test/a.png");
    expect(metaValue(custom.meta, "robots")).toBe(NOT_INDEXABLE);
  });

  it("emits JSON-LD only when it is given some", () => {
    expect(jsonLdOf(head.meta)).toBeUndefined();
    const withLd = seoHead({
      title: "A",
      description: "B",
      path: "/a",
      origin: ORIGIN,
      jsonLd: { "@type": "Thing" },
    });
    expect(jsonLdOf(withLd.meta)).toEqual({ "@type": "Thing" });
  });

  it("gives two different routes two different titles and canonicals", () => {
    const other = seoHead({
      title: "Verify",
      description: "Check a document.",
      path: "/verify",
      origin: ORIGIN,
    });
    expect(titleOf(other.meta)).not.toBe(titleOf(head.meta));
    expect(other.links[0]?.href).not.toBe(head.links[0]?.href);
  });
});

describe("noindexHead", () => {
  it("refuses indexing to both the generic and the specific crawler token", () => {
    const head = noindexHead();
    expect(metaValue(head.meta, "robots")).toBe(NOT_INDEXABLE);
    expect(metaValue(head.meta, "googlebot")).toBe(NOT_INDEXABLE);
  });

  it("emits no canonical, because these pages are not asking to be indexed anywhere", () => {
    expect(noindexHead().links).toEqual([]);
    expect(noindexHead("Sign in").links).toEqual([]);
  });

  it("takes an optional title and brands it", () => {
    expect(titleOf(noindexHead("Sign in").meta)).toBe(`Sign in | ${SITE_NAME}`);
    expect(titleOf(noindexHead().meta)).toBeUndefined();
  });
});

describe("isPrivatePath", () => {
  it("matches every private prefix and everything under it", () => {
    for (const prefix of PRIVATE_PATH_PREFIXES) {
      expect(isPrivatePath(prefix)).toBe(true);
      expect(isPrivatePath(`${prefix}/anything/deeper`)).toBe(true);
      expect(isPrivatePath(`${prefix}/`)).toBe(true);
    }
  });

  it("leaves the public surface alone", () => {
    for (const path of [
      "/",
      "/browse",
      "/listings/abc",
      "/due-diligence/request",
      "/verify",
      "/sitemap.xml",
      "/robots.txt",
    ]) {
      expect(isPrivatePath(path)).toBe(false);
    }
  });

  it("does not match a public path that merely starts with the same letters", () => {
    expect(isPrivatePath("/logins-explained")).toBe(false);
    expect(isPrivatePath("/dashboards-for-sale")).toBe(false);
  });

  it("ignores query strings, which is how a crawler would reach it", () => {
    expect(isPrivatePath("/dashboard/buyer?tab=offers")).toBe(true);
  });
});

describe("listing metadata", () => {
  it("builds the detail path", () => {
    expect(listingPath("abc")).toBe("/listings/abc");
  });

  it("adds the location to the title", () => {
    expect(listingTitle(LISTING)).toBe("Four bedroom duplex in Lekki");
  });

  it("does not repeat a location the title already names", () => {
    expect(listingTitle({ ...LISTING, title: "Duplex in Lekki" })).toBe("Duplex in Lekki");
    expect(listingTitle({ ...LISTING, location: "" })).toBe("Four bedroom duplex");
  });

  it("prefers the seller's own description", () => {
    expect(listingDescription(LISTING)).toBe(
      "A finished duplex with registered title and a completed survey.",
    );
  });

  it("writes something specific rather than the site default when there is no description", () => {
    const generated = listingDescription({ ...LISTING, description: "   " });
    expect(generated).toContain("Four bedroom duplex in Lekki");
    expect(generated).toContain("4 bed, 5 bath, 450 sqm");
  });

  it("omits specs it does not have", () => {
    const generated = listingDescription({
      ...LISTING,
      description: null,
      beds: null,
      baths: null,
      landAreaSqm: null,
    });
    expect(generated).not.toContain("4 bed");
    expect(generated).not.toContain("450 sqm");
    expect(generated).toContain(SITE_NAME);
  });

  it("maps the property types the product stores", () => {
    expect(residenceType("APARTMENT")).toBe("Apartment");
    expect(residenceType("flat")).toBe("Apartment");
    expect(residenceType("DUPLEX")).toBe("SingleFamilyResidence");
    expect(residenceType("semi-detached")).toBe("SingleFamilyResidence");
    expect(residenceType("LAND")).toBe("Place");
    expect(residenceType("something new")).toBe("Residence");
    expect(residenceType(null)).toBe("Residence");
    expect(residenceType(undefined)).toBe("Residence");
  });

  it("says limited availability for a listing that is under offer", () => {
    expect(listingAvailability("LIVE")).toBe("https://schema.org/InStock");
    expect(listingAvailability("UNDER_OFFER")).toBe("https://schema.org/LimitedAvailability");
    expect(listingAvailability(undefined)).toBe("https://schema.org/InStock");
  });
});

describe("listingJsonLd", () => {
  const ld = listingJsonLd(LISTING, ORIGIN);

  it("is a RealEstateListing pointing at the canonical detail URL", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("RealEstateListing");
    expect(ld.url).toBe("https://example.test/listings/listing-1");
    expect(ld.datePosted).toBe("2026-01-04T09:00:00.000Z");
  });

  it("describes the property, its address and its size", () => {
    const about = ld.about as Record<string, unknown>;
    expect(about["@type"]).toBe("SingleFamilyResidence");
    expect(about.numberOfBedrooms).toBe(4);
    expect(about.numberOfBathroomsTotal).toBe(5);
    expect(about.floorSize).toEqual({ "@type": "QuantitativeValue", value: 450, unitCode: "MTK" });
    expect(about.address).toEqual({
      "@type": "PostalAddress",
      addressCountry: "NG",
      addressLocality: "Lekki",
    });
  });

  it("prices the offer in the listing currency", () => {
    expect(ld.offers).toEqual({
      "@type": "Offer",
      price: "185000000",
      priceCurrency: "NGN",
      availability: "https://schema.org/InStock",
      url: "https://example.test/listings/listing-1",
    });
  });

  it("omits keys rather than claim a null, because a null is still a claim", () => {
    const sparse = listingJsonLd(
      { id: "x", title: "Plot", location: "", status: "LIVE", propertyType: "LAND" },
      ORIGIN,
    );
    const about = sparse.about as Record<string, unknown>;
    expect(about).not.toHaveProperty("numberOfBedrooms");
    expect(about).not.toHaveProperty("numberOfBathroomsTotal");
    expect(about).not.toHaveProperty("floorSize");
    expect(about.address).toEqual({ "@type": "PostalAddress", addressCountry: "NG" });
    expect(sparse).not.toHaveProperty("offers");
    expect(sparse).not.toHaveProperty("datePosted");
  });

  it("drops an unparseable price rather than emit it", () => {
    const bad = listingJsonLd({ ...LISTING, price: "on request" }, ORIGIN);
    expect(bad).not.toHaveProperty("offers");
  });

  it("defaults the currency when the listing has none", () => {
    const ld2 = listingJsonLd({ ...LISTING, currency: null }, ORIGIN);
    expect((ld2.offers as Record<string, unknown>).priceCurrency).toBe("NGN");
  });
});

describe("listingHead", () => {
  const head = listingHead(LISTING, ORIGIN);

  it("gives the listing its own title, description and canonical", () => {
    expect(titleOf(head.meta)).toBe(`Four bedroom duplex in Lekki | ${SITE_NAME}`);
    expect(metaValue(head.meta, "description")).toBe(
      "A finished duplex with registered title and a completed survey.",
    );
    expect(head.links).toEqual([
      { rel: "canonical", href: "https://example.test/listings/listing-1" },
    ]);
  });

  it("carries the structured data and is indexable", () => {
    expect(jsonLdOf(head.meta)?.["@type"]).toBe("RealEstateListing");
    expect(metaValue(head.meta, "robots")).toBe(INDEXABLE);
    expect(metaValue(head.meta, "og:type")).toBe("article");
  });

  it("gives two listings two different canonicals", () => {
    const other = listingHead({ ...LISTING, id: "listing-2" }, ORIGIN);
    expect(other.links[0]?.href).toBe("https://example.test/listings/listing-2");
  });
});

describe("listingRouteHead", () => {
  it("is the full listing head when the server render found the listing", () => {
    const head = listingRouteHead(LISTING.id, LISTING, ORIGIN);
    expect(titleOf(head.meta)).toBe(`Four bedroom duplex in Lekki | ${SITE_NAME}`);
    expect(jsonLdOf(head.meta)?.["@type"]).toBe("RealEstateListing");
  });

  it("keeps the canonical and invents nothing when there is no listing", () => {
    const head = listingRouteHead("listing-9", undefined, ORIGIN);
    expect(head.meta).toEqual([]);
    expect(head.links).toEqual([
      { rel: "canonical", href: "https://example.test/listings/listing-9" },
    ]);
  });
});
