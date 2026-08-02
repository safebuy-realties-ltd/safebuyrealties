import { describe, expect, it, vi } from "vitest";
import {
  BROWSE_PAGE_SIZE,
  SSR_DEV_API_ORIGIN,
  SSR_FETCH_TIMEOUT_MS,
  fetchSsrJson,
  isSsrBrowseQuery,
  ssrApiBase,
  ssrBrowseListings,
  ssrListing,
} from "@/lib/ssr-data";

type FetchCall = { url: string; init: RequestInit | undefined };

/** A `fetch` that answers with whatever the test hands it and records how it was called. */
function stubFetch(
  responder: (url: string) => { ok?: boolean; body?: unknown; throws?: boolean },
): { fetch: typeof globalThis.fetch; calls: Array<FetchCall> } {
  const calls: Array<FetchCall> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const answer = responder(url);
    if (answer.throws) throw new Error("network down");
    return {
      ok: answer.ok ?? true,
      json: async () => answer.body,
    } as unknown as Response;
  }) as unknown as typeof globalThis.fetch;
  return { fetch: fetchImpl, calls };
}

const LIVE_LISTING = {
  id: "listing-1",
  title: "Four bedroom duplex",
  status: "LIVE",
  isPublished: true,
};

describe("ssrApiBase", () => {
  it("uses the target the deployment already rewrites the API to", () => {
    expect(ssrApiBase({ API_PROXY_TARGET: "https://api.example.test" })).toBe(
      "https://api.example.test/api/v1",
    );
  });

  it("accepts the SBR-prefixed name and trims trailing slashes", () => {
    expect(ssrApiBase({ SBR_API_PROXY_TARGET: "https://api.example.test///" })).toBe(
      "https://api.example.test/api/v1",
    );
  });

  it("falls back to the local API outside production", () => {
    expect(ssrApiBase({})).toBe(`${SSR_DEV_API_ORIGIN}/api/v1`);
    expect(ssrApiBase({ NODE_ENV: "development" })).toBe(`${SSR_DEV_API_ORIGIN}/api/v1`);
  });

  it("stays quiet in production when nothing is configured", () => {
    expect(ssrApiBase({ NODE_ENV: "production" })).toBeUndefined();
    expect(ssrApiBase({ NODE_ENV: "production", API_PROXY_TARGET: "   " })).toBeUndefined();
  });
});

describe("fetchSsrJson", () => {
  it("returns the parsed body and asks for JSON under a deadline", async () => {
    const { fetch, calls } = stubFetch(() => ({ body: { data: 1 } }));

    await expect(fetchSsrJson("https://api.example.test/thing", fetch)).resolves.toEqual({
      data: 1,
    });
    expect(calls[0]?.init?.headers).toEqual({ accept: "application/json" });
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("gives up quietly on a refusal", async () => {
    const { fetch } = stubFetch(() => ({ ok: false, body: { data: 1 } }));
    await expect(fetchSsrJson("https://api.example.test/thing", fetch)).resolves.toBeUndefined();
  });

  it("gives up quietly when the request throws", async () => {
    const { fetch } = stubFetch(() => ({ throws: true }));
    await expect(fetchSsrJson("https://api.example.test/thing", fetch)).resolves.toBeUndefined();
  });

  it("aborts rather than holding the render open forever", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { fetch } = stubFetch(() => ({ body: {} }));

    await fetchSsrJson("https://api.example.test/thing", fetch);

    expect(timeout).toHaveBeenCalledWith(SSR_FETCH_TIMEOUT_MS);
    timeout.mockRestore();
  });
});

describe("ssrListing", () => {
  it("returns a publicly viewable listing", async () => {
    const { fetch, calls } = stubFetch(() => ({ body: { data: LIVE_LISTING } }));

    await expect(
      ssrListing({ API_PROXY_TARGET: "https://api.example.test" }, "listing-1", fetch),
    ).resolves.toEqual(LIVE_LISTING);
    expect(calls[0]?.url).toBe("https://api.example.test/api/v1/listings/listing-1");
  });

  it("escapes the id rather than pasting it into the URL", async () => {
    const { fetch, calls } = stubFetch(() => ({ body: { data: LIVE_LISTING } }));

    await ssrListing({ API_PROXY_TARGET: "https://api.example.test" }, "a b/c", fetch);

    expect(calls[0]?.url).toBe("https://api.example.test/api/v1/listings/a%20b%2Fc");
  });

  it("refuses to describe a listing the public cannot see", async () => {
    const { fetch } = stubFetch(() => ({
      body: { data: { ...LIVE_LISTING, status: "DRAFT" } },
    }));

    await expect(
      ssrListing({ API_PROXY_TARGET: "https://api.example.test" }, "listing-1", fetch),
    ).resolves.toBeUndefined();
  });

  it("refuses a verified listing that has not been published yet", async () => {
    const { fetch } = stubFetch(() => ({
      body: { data: { ...LIVE_LISTING, status: "VERIFIED", isPublished: false } },
    }));

    await expect(
      ssrListing({ API_PROXY_TARGET: "https://api.example.test" }, "listing-1", fetch),
    ).resolves.toBeUndefined();
  });

  /**
   * Every listing seeded so far is `LIVE` with `isPublished` false, and the API serves all of them to
   * signed-out visitors. Refusing them here would leave the site with nothing to render on the server
   * and nothing to put in the sitemap.
   */
  it("describes a live listing that was never explicitly published", async () => {
    const listing = { ...LIVE_LISTING, isPublished: false };
    const { fetch } = stubFetch(() => ({ body: { data: listing } }));

    await expect(
      ssrListing({ API_PROXY_TARGET: "https://api.example.test" }, "listing-1", fetch),
    ).resolves.toEqual(listing);
  });

  it("returns nothing for an empty envelope or an empty id", async () => {
    const { fetch } = stubFetch(() => ({ body: {} }));
    const env = { API_PROXY_TARGET: "https://api.example.test" };

    await expect(ssrListing(env, "listing-1", fetch)).resolves.toBeUndefined();
    await expect(ssrListing(env, "  ", fetch)).resolves.toBeUndefined();
  });

  it("does not call anything when there is no API to call", async () => {
    const { fetch, calls } = stubFetch(() => ({ body: { data: LIVE_LISTING } }));

    await expect(
      ssrListing({ NODE_ENV: "production" }, "listing-1", fetch),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

describe("ssrBrowseListings", () => {
  it("asks for the first page at the size the browse page uses", async () => {
    const envelope = { data: [LIVE_LISTING], meta: { page: 1, pageSize: 24, total: 1 } };
    const { fetch, calls } = stubFetch(() => ({ body: envelope }));

    await expect(
      ssrBrowseListings({ API_PROXY_TARGET: "https://api.example.test" }, fetch),
    ).resolves.toEqual(envelope);
    expect(calls[0]?.url).toBe(
      `https://api.example.test/api/v1/listings?page=1&pageSize=${BROWSE_PAGE_SIZE}`,
    );
  });

  it("returns nothing when the payload is not a list of listings", async () => {
    const { fetch } = stubFetch(() => ({ body: { data: "nope" } }));

    await expect(
      ssrBrowseListings({ API_PROXY_TARGET: "https://api.example.test" }, fetch),
    ).resolves.toBeUndefined();
  });

  it("does not call anything when there is no API to call", async () => {
    const { fetch, calls } = stubFetch(() => ({ body: { data: [] } }));

    await expect(ssrBrowseListings({ NODE_ENV: "production" }, fetch)).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

describe("isSsrBrowseQuery", () => {
  it("recognises the query the server actually answered", () => {
    expect(isSsrBrowseQuery({ pageSize: BROWSE_PAGE_SIZE })).toBe(true);
    expect(isSsrBrowseQuery({})).toBe(true);
  });

  it("refuses a filtered or paged query, which the server never ran", () => {
    expect(isSsrBrowseQuery({ pageSize: BROWSE_PAGE_SIZE, location: "Lekki" })).toBe(false);
    expect(isSsrBrowseQuery({ pageSize: BROWSE_PAGE_SIZE, minPrice: 1 })).toBe(false);
    expect(isSsrBrowseQuery({ pageSize: BROWSE_PAGE_SIZE, maxPrice: 1 })).toBe(false);
    expect(isSsrBrowseQuery({ pageSize: BROWSE_PAGE_SIZE, minBeds: 2 })).toBe(false);
    expect(isSsrBrowseQuery({ pageSize: BROWSE_PAGE_SIZE, buildType: "DUPLEX" })).toBe(false);
    expect(isSsrBrowseQuery({ pageSize: BROWSE_PAGE_SIZE, status: "LIVE" })).toBe(false);
    expect(isSsrBrowseQuery({ pageSize: BROWSE_PAGE_SIZE, sellerId: "seller-1" })).toBe(false);
    expect(isSsrBrowseQuery({ pageSize: BROWSE_PAGE_SIZE, page: 2 })).toBe(false);
    expect(isSsrBrowseQuery({ pageSize: 10 })).toBe(false);
  });

  it("refuses nothing at all", () => {
    expect(isSsrBrowseQuery(undefined)).toBe(false);
  });
});
