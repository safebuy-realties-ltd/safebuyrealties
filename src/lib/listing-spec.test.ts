import { describe, expect, it } from "vitest";
import {
  buildCreateListingPayload,
  formatBuildType,
  formatListingSpecSummary,
  formatSpecCount,
} from "@/lib/listing-spec";

describe("buildCreateListingPayload", () => {
  const base = {
    title: "  Villa  ",
    description: "Spacious",
    location: "Lekki",
    price: "50000000",
    currency: "NGN",
    beds: "",
    baths: "",
    landAreaSqm: "",
    buildType: "",
  };

  it("includes beds and baths when provided", () => {
    const payload = buildCreateListingPayload({
      ...base,
      beds: "4",
      baths: "3",
      landAreaSqm: "450",
      buildType: "detached",
    });

    expect(payload).toMatchObject({
      title: "Villa",
      beds: 4,
      baths: 3,
      landAreaSqm: 450,
      buildType: "detached",
    });
  });

  it("omits empty optional spec fields", () => {
    const payload = buildCreateListingPayload(base);

    expect(payload).not.toHaveProperty("beds");
    expect(payload).not.toHaveProperty("baths");
    expect(payload).not.toHaveProperty("landAreaSqm");
    expect(payload).not.toHaveProperty("buildType");
  });
});

describe("formatListingSpecSummary", () => {
  it('formats beds and baths as "4 beds · 3 baths"', () => {
    expect(formatListingSpecSummary({ beds: 4, baths: 3 })).toBe("4 beds · 3 baths");
  });

  it("returns em dash when no specs", () => {
    expect(formatListingSpecSummary({})).toBe("—");
  });
});

describe("formatSpecCount", () => {
  it("uses singular for 1", () => {
    expect(formatSpecCount(1, "bed")).toBe("1 bed");
  });
});

describe("formatBuildType", () => {
  it("title-cases enum-like values", () => {
    expect(formatBuildType("semi_detached")).toBe("Semi Detached");
  });
});
