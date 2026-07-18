import { describe, expect, it } from "vitest";
import { getLgasForState, isNigeriaState, NIGERIA_LGAS, NIGERIA_STATES } from "./nigeria-locations";

describe("nigeria-locations", () => {
  it("includes 36 states plus FCT", () => {
    expect(NIGERIA_STATES).toHaveLength(37);
    expect(NIGERIA_STATES).toContain("Lagos");
    expect(NIGERIA_STATES).toContain("FCT");
  });

  it("has LGA lists for every state", () => {
    for (const state of NIGERIA_STATES) {
      expect(NIGERIA_LGAS[state].length).toBeGreaterThan(0);
    }
  });

  it("returns LGAs for a selected state and clears unknown states", () => {
    expect(isNigeriaState("Lagos")).toBe(true);
    expect(getLgasForState("Lagos")).toContain("Eti-Osa");
    expect(getLgasForState("NotAState")).toEqual([]);
  });
});
