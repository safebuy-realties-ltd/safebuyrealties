import { describe, expect, it } from "vitest";
import {
  countSelectedItems,
  selectedScheduleCodes,
  validateChecklistSelections,
} from "@/lib/dd-schedule-checklists";

describe("dd-schedule-checklists", () => {
  it("starts with nothing selected by default", () => {
    expect(countSelectedItems({})).toBe(0);
    expect(selectedScheduleCodes({})).toEqual([]);
  });

  it("accepts per-schedule checklist selections", () => {
    const result = validateChecklistSelections({
      LEGAL_CHECK: ["LEGAL_TITLE_SEARCH", "LEGAL_COF_O"],
      SECURITY_CHECK: ["SEC_OMO_ONILE"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
        }),
      );
    }
    expect(
      countSelectedItems({
        LEGAL_CHECK: ["LEGAL_TITLE_SEARCH", "LEGAL_COF_O"],
        SECURITY_CHECK: ["SEC_OMO_ONILE"],
      }),
    ).toBe(3);
  });

  it("rejects unknown checklist codes", () => {
    const result = validateChecklistSelections({
      LEGAL_CHECK: ["NOT_A_REAL_ITEM"],
    });
    expect(result.ok).toBe(false);
  });
});
