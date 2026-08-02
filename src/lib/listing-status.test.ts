import { describe, expect, it } from "vitest";
import { listingIsPubliclyIndexable, listingIsPubliclyViewable } from "@/lib/listing-status";

describe("listingIsPubliclyIndexable", () => {
  it("matches the backend rule: LIVE is public whatever isPublished says", () => {
    expect(listingIsPubliclyIndexable("LIVE", true)).toBe(true);
    expect(listingIsPubliclyIndexable("LIVE", false)).toBe(true);
    expect(listingIsPubliclyIndexable("LIVE", undefined)).toBe(true);
  });

  it("matches the backend rule: VERIFIED is public only once it is published", () => {
    expect(listingIsPubliclyIndexable("VERIFIED", true)).toBe(true);
    expect(listingIsPubliclyIndexable("VERIFIED", false)).toBe(false);
    expect(listingIsPubliclyIndexable("VERIFIED", undefined)).toBe(false);
  });

  it("keeps everything else out of the sitemap and out of server-rendered metadata", () => {
    for (const status of [
      "DRAFT",
      "PENDING_REVIEW",
      "IN_VERIFICATION",
      "ASSIGNED",
      "REJECTED",
      "SOLD",
      "ARCHIVED",
      "UNDER_OFFER",
      "",
    ]) {
      expect(listingIsPubliclyIndexable(status, true)).toBe(false);
    }
  });
});

describe("listingIsPubliclyViewable", () => {
  /**
   * Pinned because the two predicates disagree on purpose and the difference is the reason
   * `listingIsPubliclyIndexable` exists. If somebody reconciles them, this test is the one that
   * should fail and make them read the comment above it.
   */
  it("is stricter than the API on a live but unpublished listing", () => {
    expect(listingIsPubliclyViewable("LIVE", false)).toBe(false);
    expect(listingIsPubliclyIndexable("LIVE", false)).toBe(true);
  });

  it("shows live and under-offer listings to signed-out visitors", () => {
    expect(listingIsPubliclyViewable("LIVE", true)).toBe(true);
    expect(listingIsPubliclyViewable("UNDER_OFFER", undefined)).toBe(true);
    expect(listingIsPubliclyViewable("DRAFT", true)).toBe(false);
  });
});
