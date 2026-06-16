import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useServiceItemsQuery } from "@/hooks/use-service-catalog";

const VAT_RATE = 0.075;
const DEFAULT_INSPECTION_FEE = 50_000;

/** Core due-diligence checks offered in the guest checkout flow. */
export const GUEST_DD_CHECK_CODES = [
  "DUE_DILIGENCE",
  "LAND_CHARTING_SEARCH",
  "COF_O",
  "TITLE_VERIFICATION",
] as const;

export type DdCheckSelection = {
  itemIds: string[];
  includeInspection: boolean;
  subtotal: number;
  vat: number;
  total: number;
  inspectionFee: number;
};

function formatNgn(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
}

type DdCheckSelectorProps = {
  includeInspection?: boolean;
  onIncludeInspectionChange?: (value: boolean) => void;
  onSelectionChange?: (selection: DdCheckSelection) => void;
};

export function DdCheckSelector({
  includeInspection: includeInspectionProp,
  onIncludeInspectionChange,
  onSelectionChange,
}: DdCheckSelectorProps) {
  const { data: items, isLoading } = useServiceItemsQuery();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [includeInspectionInternal, setIncludeInspectionInternal] = useState(false);

  const includeInspection = includeInspectionProp ?? includeInspectionInternal;

  const ddItems = useMemo(() => {
    if (!items) return [];
    const byCode = new Map(items.map((item) => [item.code, item]));
    return GUEST_DD_CHECK_CODES.map((code) => byCode.get(code)).filter(
      (item): item is NonNullable<typeof item> => !!item && item.active,
    );
  }, [items]);

  useEffect(() => {
    if (ddItems.length === 0) return;
    setCheckedIds(new Set(ddItems.map((item) => item.id)));
  }, [ddItems]);

  const { subtotal, vat, total, inspectionFee } = useMemo(() => {
    let sub = 0;
    for (const item of ddItems) {
      if (checkedIds.has(item.id)) {
        sub += Number(item.basePrice);
      }
    }
    const inspection = includeInspection ? DEFAULT_INSPECTION_FEE : 0;
    sub += inspection;
    const vatAmount = Math.round(sub * VAT_RATE);
    return {
      subtotal: sub,
      vat: vatAmount,
      total: sub + vatAmount,
      inspectionFee: inspection,
    };
  }, [ddItems, checkedIds, includeInspection]);

  useEffect(() => {
    onSelectionChange?.({
      itemIds: Array.from(checkedIds),
      includeInspection,
      subtotal,
      vat,
      total,
      inspectionFee,
    });
  }, [checkedIds, includeInspection, subtotal, vat, total, inspectionFee, onSelectionChange]);

  const setIncludeInspection = (value: boolean) => {
    onIncludeInspectionChange?.(value);
    if (includeInspectionProp === undefined) {
      setIncludeInspectionInternal(value);
    }
  };

  const toggleItem = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {ddItems.map((item) => {
          const checked = checkedIds.has(item.id);
          return (
            <label
              key={item.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 p-4 transition-colors hover:bg-secondary/30"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggleItem(item.id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-primary">
                {formatNgn(Number(item.basePrice))}
              </p>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
        <div>
          <Label htmlFor="include-inspection" className="text-sm font-medium">
            Physical property inspection
          </Label>
          <p className="text-xs text-muted-foreground">
            Book a physical visit to inspect the property ({formatNgn(DEFAULT_INSPECTION_FEE)}).
          </p>
        </div>
        <Switch
          id="include-inspection"
          checked={includeInspection}
          onCheckedChange={setIncludeInspection}
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatNgn(subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>VAT (7.5%)</span>
            <span>{formatNgn(vat)}</span>
          </div>
          <div className="my-2 h-px bg-border/60" />
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span className="text-primary">{formatNgn(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
