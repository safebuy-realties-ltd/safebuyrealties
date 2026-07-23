import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DD_SCHEDULES,
  countSelectedItems,
  type DdChecklistSelections,
  type DdScheduleCode,
} from "@/lib/dd-schedule-checklists";

export type DdScheduleChecklistSelection = {
  checklistSelections: DdChecklistSelections;
  selectedCount: number;
  scheduleCodes: DdScheduleCode[];
};

type Props = {
  value?: DdChecklistSelections;
  onChange?: (selection: DdScheduleChecklistSelection) => void;
};

export function DdScheduleChecklistSelector({ value, onChange }: Props) {
  const [selections, setSelections] = useState<DdChecklistSelections>(value ?? {});

  useEffect(() => {
    if (value) setSelections(value);
  }, [value]);

  const payload = useMemo(() => {
    const scheduleCodes = DD_SCHEDULES.map((s) => s.code).filter(
      (code) => (selections[code]?.length ?? 0) > 0,
    ) as DdScheduleCode[];
    return {
      checklistSelections: selections,
      selectedCount: countSelectedItems(selections),
      scheduleCodes,
    };
  }, [selections]);

  useEffect(() => {
    onChange?.(payload);
  }, [payload, onChange]);

  const updateSchedule = (code: DdScheduleCode, nextCodes: string[]) => {
    setSelections((prev) => {
      const next = { ...prev };
      if (nextCodes.length === 0) {
        delete next[code];
      } else {
        next[code] = nextCodes;
      }
      return next;
    });
  };

  const toggleItem = (scheduleCode: DdScheduleCode, itemCode: string) => {
    const current = new Set(selections[scheduleCode] ?? []);
    if (current.has(itemCode)) current.delete(itemCode);
    else current.add(itemCode);
    updateSchedule(scheduleCode, Array.from(current));
  };

  const selectAll = (scheduleCode: DdScheduleCode) => {
    const schedule = DD_SCHEDULES.find((entry) => entry.code === scheduleCode);
    if (!schedule) return;
    updateSchedule(
      scheduleCode,
      schedule.items.map((item) => item.code),
    );
  };

  const clearAll = (scheduleCode: DdScheduleCode) => {
    updateSchedule(scheduleCode, []);
  };

  return (
    <div className="space-y-5">
      {DD_SCHEDULES.map((schedule) => {
        const selected = selections[schedule.code] ?? [];
        const allSelected = selected.length === schedule.items.length;
        return (
          <section
            key={schedule.code}
            className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Schedule {schedule.letter}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">{schedule.shortName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{schedule.description}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={allSelected ? "default" : "outline"}
                  onClick={() =>
                    allSelected ? clearAll(schedule.code) : selectAll(schedule.code)
                  }
                >
                  {allSelected ? "Clear all" : "Select all"}
                </Button>
              </div>
            </div>

            <ul className="mt-4 space-y-2">
              {schedule.items.map((item) => {
                const checked = selected.includes(item.code);
                return (
                  <li key={item.code}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/50 px-3 py-3 transition-colors hover:bg-secondary/30">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleItem(schedule.code, item.code)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                        {item.description ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              {selected.length} of {schedule.items.length} selected
            </p>
          </section>
        );
      })}
    </div>
  );
}
