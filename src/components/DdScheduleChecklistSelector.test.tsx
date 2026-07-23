import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DdScheduleChecklistSelector } from "@/components/DdScheduleChecklistSelector";

describe("DdScheduleChecklistSelector", () => {
  it("selects all legal items and reports count via onChange", () => {
    const onChange = vi.fn();
    render(<DdScheduleChecklistSelector onChange={onChange} />);

    fireEvent.click(screen.getByTestId("dd-select-all-LEGAL_CHECK"));

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.selectedCount).toBe(10);
    expect(last.scheduleCodes).toContain("LEGAL_CHECK");
    expect(last.checklistSelections.LEGAL_CHECK).toHaveLength(10);
  });

  it("toggles an individual security item from the label button", () => {
    const onChange = vi.fn();
    render(<DdScheduleChecklistSelector onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Omo-onile/i }));

    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.selectedCount).toBe(1);
    expect(last.checklistSelections.SECURITY_CHECK).toEqual(["SEC_OMO_ONILE"]);
  });
});
