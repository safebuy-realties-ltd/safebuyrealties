import { describe, expect, it } from "vitest";
import { PRIVATE_PATH_PREFIXES, SITE_URL } from "@/lib/seo";
import {
  SITEMAP_MAX_LISTINGS,
  SITEMAP_PAGE_SIZE,
  STATIC_SITEMAP_ENTRIES,
  buildRobotsTxt,
  buildSitemapXml,
  fetchSitemapListings,
  isCanonicalOrigin,
  listingSitemapEntries,
  originFromRequest,
  resolveServerApiBase,
  toLastModified,
  xmlEscape,
  type SitemapListing,
} from "@/lib/sitemap";

const ORIGIN = "https://example.test";

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("STATIC_SITEMAP_ENTRIES", () => {
  it("lists public routes only", () => {
    for (const entry of STATIC_SITEMAP_ENTRIES) {
      for (const prefix of PRIVATE_PATH_PREFIXES) {
        expect(entry.path.startsWith(prefix)).toBe(false);
      }
    }
  });

  it("has no duplicate paths, because a duplicate url is a crawl error", () => {
    const paths = STATIC_SITEMAP_ENTRIES.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("toLastModified", () => {
  it("normalises a parseable date", () => {
    expect(toLastModified("2026-02-01T09:00:00.000Z")).toBe("2026-02-01T09:00:00.000Z");
    expect(toLastModified("2026-02-01")).toBe("2026-02-01T00:00:00.000Z");
  });

  it("drops anything it cannot parse rather than emit a broken lastmod", () => {
    expect(toLastModified(undefined)).toBeUndefined();
    expect(toLastModified("")).toBeUndefined();
    expect(toLastModified("last tuesday")).toBeUndefined();
  });
});

describe("listingSitemapEntries", () => {
  const listings: Array<SitemapListing> = [
    { id: "live", status: "LIVE", isPublished: true, updatedAt: "2026-02-01T09:00:00.000Z" },
    { id: "live-unpublished", status: "LIVE", isPublished: false },
    { id: "published-verified", status: "VERIFIED", isPublished: true },
    { id: "draft", status: "DRAFT", isPublished: true },
    { id: "pending", status: "PENDING_REVIEW", isPublished: true },
    { id: "unpublished-verified", status: "VERIFIED", isPublished: false },
    { id: "sold", status: "SOLD", isPublished: true },
    { id: "offer", status: "UNDER_OFFER", isPublished: true },
  ];

  it("includes exactly what the API serves without a session, which is criterion 3", () => {
    expect(listingSitemapEntries(listings).map((entry) => entry.path)).toEqual([
      "/listings/live",
      "/listings/live-unpublished",
      "/listings/published-verified",
    ]);
  });

  it("carries lastmod when the listing has one and omits it when it does not", () => {
    const [live, unpublished] = listingSitemapEntries(listings);
    expect(live?.lastModified).toBe("2026-02-01T09:00:00.000Z");
    expect(unpublished?.lastModified).toBeUndefined();
  });

  it("returns nothing for an empty catalogue rather than throwing", () => {
    expect(listingSitemapEntries([])).toEqual([]);
  });
});

describe("xmlEscape", () => {
  it("escapes the five predefined entities", () => {
    expect(xmlEscape(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("escapes the ampersand once, not twice", () => {
    expect(xmlEscape("a & b")).toBe("a &amp; b");
    expect(xmlEscape("&amp;")).toBe("&amp;amp;");
  });

  it("leaves ordinary text alone", () => {
    expect(xmlEscape("/listings/clx123")).toBe("/listings/clx123");
  });
});

describe("buildSitemapXml", () => {
  const xml = buildSitemapXml(
    [
      { path: "/", changeFrequency: "weekly", priority: 1 },
      { path: "/listings/abc", lastModified: "2026-02-01T09:00:00.000Z", priority: 0.8 },
      { path: "/verify" },
    ],
    ORIGIN,
  );

  it("is a well formed url set", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    expect(xml.match(/<url>/g)).toHaveLength(3);
  });

  it("writes absolute locations on the origin it was given", () => {
    expect(xml).toContain("<loc>https://example.test/</loc>");
    expect(xml).toContain("<loc>https://example.test/listings/abc</loc>");
    expect(xml).toContain("<loc>https://example.test/verify</loc>");
  });

  it("emits the optional elements only when they are set", () => {
    expect(xml).toContain("<lastmod>2026-02-01T09:00:00.000Z</lastmod>");
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    expect(xml.match(/<changefreq>/g)).toHaveLength(1);
    expect(xml).toContain("<priority>1.0</priority>");
    expect(xml).toContain("<priority>0.8</priority>");
    expect(xml.match(/<priority>/g)).toHaveLength(2);
  });

  it("escapes a path that would otherwise break the document", () => {
    const escaped = buildSitemapXml([{ path: "/listings/a&b" }], ORIGIN);
    expect(escaped).toContain("<loc>https://example.test/listings/a&amp;b</loc>");
    expect(escaped).not.toContain("a&b");
  });

  it("still produces a valid empty url set", () => {
    const empty = buildSitemapXml([], ORIGIN);
    expect(empty).not.toContain("<url>");
    expect(empty).toContain("</urlset>");
  });

  it("defaults to the site origin", () => {
    expect(buildSitemapXml([{ path: "/" }])).toContain(`<loc>${SITE_URL}/</loc>`);
  });
});

describe("buildRobotsTxt", () => {
  const robots = buildRobotsTxt({ origin: ORIGIN });

  it("names the sitemap on the host that served the file", () => {
    expect(robots).toContain("Sitemap: https://example.test/sitemap.xml");
  });

  it("disallows every private prefix, and says so the same way isPrivatePath does", () => {
    for (const prefix of PRIVATE_PATH_PREFIXES) {
      expect(robots).toContain(`Disallow: ${prefix}$`);
      expect(robots).toContain(`Disallow: ${prefix}/`);
    }
  });

  it("allows the rest", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).not.toContain("Disallow: /\n");
  });

  it("refuses everything on a host that is not the canonical one", () => {
    const preview = buildRobotsTxt({
      origin: "https://preview-abc.vercel.app",
      allowIndexing: false,
    });
    expect(preview).toContain("Disallow: /");
    expect(preview).not.toContain("Allow: /");
    expect(preview).not.toContain("Sitemap:");
  });

  it("defaults to the site origin and to allowing indexing", () => {
    expect(buildRobotsTxt()).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it("ends with a newline, which is what a text file is", () => {
    expect(robots.endsWith("\n")).toBe(true);
    expect(buildRobotsTxt({ allowIndexing: false }).endsWith("\n")).toBe(true);
  });
});

describe("originFromRequest", () => {
  it("prefers the forwarded host, because that is the one the caller typed", () => {
    expect(
      originFromRequest({
        url: "https://internal/robots.txt",
        headers: headers({
          host: "internal-1.vercel.internal",
          "x-forwarded-host": "safebuyrealties-app.vercel.app",
          "x-forwarded-proto": "https",
        }),
      }),
    ).toBe("https://safebuyrealties-app.vercel.app");
  });

  it("takes the first value when a proxy chain appended more", () => {
    expect(
      originFromRequest({
        url: "https://a/robots.txt",
        headers: headers({
          "x-forwarded-host": "first.example, second.example",
          "x-forwarded-proto": "https, http",
        }),
      }),
    ).toBe("https://first.example");
  });

  it("falls back to host when nothing was forwarded", () => {
    expect(
      originFromRequest({ url: "https://a/robots.txt", headers: headers({ host: "app.test" }) }),
    ).toBe("https://app.test");
  });

  it("assumes http for local development, where there is no certificate", () => {
    expect(
      originFromRequest({
        url: "http://localhost:8080/robots.txt",
        headers: headers({ host: "localhost:8080" }),
      }),
    ).toBe("http://localhost:8080");
    expect(
      originFromRequest({
        url: "http://127.0.0.1:8080/robots.txt",
        headers: headers({ host: "127.0.0.1:8080" }),
      }),
    ).toBe("http://127.0.0.1:8080");
  });

  it("falls back to the configured site when there is no host header at all", () => {
    expect(originFromRequest({ url: "https://a/robots.txt", headers: headers({}) })).toBe(SITE_URL);
  });
});

describe("isCanonicalOrigin", () => {
  it("compares hosts, so a scheme or a path does not change the answer", () => {
    expect(isCanonicalOrigin("https://app.test", "https://app.test")).toBe(true);
    expect(isCanonicalOrigin("http://app.test", "https://app.test")).toBe(true);
    expect(isCanonicalOrigin("https://app.test/browse", "https://app.test")).toBe(true);
  });

  it("says no to a preview deployment", () => {
    expect(isCanonicalOrigin("https://preview-abc.vercel.app", "https://app.test")).toBe(false);
  });

  it("says no rather than throw on something unparseable", () => {
    expect(isCanonicalOrigin("not a url", "https://app.test")).toBe(false);
    expect(isCanonicalOrigin("https://app.test", "not a url")).toBe(false);
  });

  it("defaults the comparison to this deployment's own site url", () => {
    expect(isCanonicalOrigin(SITE_URL)).toBe(true);
  });
});

describe("resolveServerApiBase", () => {
  it("uses the target the Vercel rewrite already points at", () => {
    expect(resolveServerApiBase({ API_PROXY_TARGET: "https://api.test" }, ORIGIN)).toBe(
      "https://api.test/api/v1",
    );
  });

  it("accepts the prefixed alias", () => {
    expect(resolveServerApiBase({ SBR_API_PROXY_TARGET: "https://api.test" }, ORIGIN)).toBe(
      "https://api.test/api/v1",
    );
  });

  it("prefers the unprefixed name when both are set", () => {
    expect(
      resolveServerApiBase(
        { API_PROXY_TARGET: "https://one.test", SBR_API_PROXY_TARGET: "https://two.test" },
        ORIGIN,
      ),
    ).toBe("https://one.test/api/v1");
  });

  it("falls back to the request's own origin, which is the local development path", () => {
    expect(resolveServerApiBase({}, "http://localhost:8080")).toBe("http://localhost:8080/api/v1");
    expect(resolveServerApiBase({ API_PROXY_TARGET: "   " }, ORIGIN)).toBe(
      "https://example.test/api/v1",
    );
  });

  it("does not produce a double slash", () => {
    expect(resolveServerApiBase({ API_PROXY_TARGET: "https://api.test///" }, ORIGIN)).toBe(
      "https://api.test/api/v1",
    );
  });
});

/** A fetch that records what it was asked for and answers from a queue of scripted replies. */
function stubFetch(replies: Array<{ ok?: boolean; status?: number; body?: unknown }>) {
  const urls: Array<string> = [];
  let call = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    const reply = replies[call] ?? { ok: false, status: 404 };
    call += 1;
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      json: async () => reply.body,
    } as Response;
  }) as typeof globalThis.fetch;
  return { fetchImpl, urls };
}

function page(count: number, offset = 0, total?: number) {
  return {
    body: {
      data: Array.from({ length: count }, (_, i) => ({
        id: `listing-${offset + i}`,
        status: "LIVE",
        isPublished: true,
      })),
      meta: total === undefined ? undefined : { total },
    },
  };
}

describe("fetchSitemapListings", () => {
  /**
   * The regression this file exists for. `ListListingsQueryDto` in the backend caps `pageSize` at
   * 100, and a request over that is a 400, which this function turns into an empty catalogue. The
   * sitemap then serves its static pages and looks perfectly healthy while advertising no listings
   * at all. Nothing else here would have failed.
   */
  it("asks for a page size the API will actually accept", () => {
    expect(SITEMAP_PAGE_SIZE).toBeGreaterThan(0);
    expect(SITEMAP_PAGE_SIZE).toBeLessThanOrEqual(100);
    expect(SITEMAP_MAX_LISTINGS).toBeGreaterThanOrEqual(SITEMAP_PAGE_SIZE);
  });

  it("asks the listings endpoint for the first page and stops on a short one", async () => {
    const { fetchImpl, urls } = stubFetch([page(3)]);

    const listings = await fetchSitemapListings("https://api.test/api/v1", fetchImpl);

    expect(urls).toEqual([`https://api.test/api/v1/listings?page=1&pageSize=${SITEMAP_PAGE_SIZE}`]);
    expect(listings.map((l) => l.id)).toEqual(["listing-0", "listing-1", "listing-2"]);
  });

  it("keeps paging while the API hands back full pages", async () => {
    const { fetchImpl, urls } = stubFetch([
      page(SITEMAP_PAGE_SIZE, 0, SITEMAP_PAGE_SIZE + 2),
      page(2, SITEMAP_PAGE_SIZE, SITEMAP_PAGE_SIZE + 2),
    ]);

    const listings = await fetchSitemapListings("https://api.test/api/v1", fetchImpl);

    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("page=2");
    expect(listings).toHaveLength(SITEMAP_PAGE_SIZE + 2);
  });

  it("stops once the reported total is covered, without asking for a page it does not need", async () => {
    const { fetchImpl, urls } = stubFetch([page(SITEMAP_PAGE_SIZE, 0, SITEMAP_PAGE_SIZE)]);

    await fetchSitemapListings("https://api.test/api/v1", fetchImpl);

    expect(urls).toHaveLength(1);
  });

  it("degrades to no listings when the API refuses the request", async () => {
    const { fetchImpl } = stubFetch([{ ok: false, status: 400 }]);

    await expect(fetchSitemapListings("https://api.test/api/v1", fetchImpl)).resolves.toEqual([]);
  });

  it("degrades to no listings when the API is unreachable or the body is not a list", async () => {
    const throwing = (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof globalThis.fetch;
    await expect(fetchSitemapListings("https://api.test/api/v1", throwing)).resolves.toEqual([]);

    const { fetchImpl } = stubFetch([{ body: { data: { items: [] } } }]);
    await expect(fetchSitemapListings("https://api.test/api/v1", fetchImpl)).resolves.toEqual([]);
  });
});
