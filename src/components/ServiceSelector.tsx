import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { useServiceBundlesQuery, useServiceItemsQuery } from "@/hooks/use-service-catalog";
import type { ServiceBundle, ServiceCatalogItem } from "@/hooks/use-service-catalog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const VAT_RATE = 0.075;

function formatNgn(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
}

type ServiceSelectorProps = {
  onSelectionChange?: (selection: {
    bundleId?: string;
    itemIds: string[];
    subtotal: number;
    vat: number;
    total: number;
  }) => void;
};

export default function ServiceSelector({ onSelectionChange }: ServiceSelectorProps) {
  const { data: bundles, isLoading: bundlesLoading } = useServiceBundlesQuery();
  const { data: items, isLoading: itemsLoading } = useServiceItemsQuery();

  const [selectedBundleId, setSelectedBundleId] = useState<string | undefined>(undefined);
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(new Set());
  const [alaCarteOpen, setAlaCarteOpen] = useState(false);

  const isLoading = bundlesLoading || itemsLoading;

  // When bundle is selected, pre-check all its items
  const handleSelectBundle = (bundle: ServiceBundle) => {
    if (selectedBundleId === bundle.id) {
      // Deselect bundle
      setSelectedBundleId(undefined);
      setCheckedItemIds(new Set());
    } else {
      setSelectedBundleId(bundle.id);
      setCheckedItemIds(new Set(bundle.items.map((i) => i.id)));
    }
  };

  const handleToggleItem = (item: ServiceCatalogItem) => {
    setCheckedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });

    // If a bundle is selected and user toggles an item, clear bundle selection
    if (selectedBundleId) {
      setSelectedBundleId(undefined);
    }
  };

  // Calculate totals client-side
  const { subtotal, vat, total } = useMemo(() => {
    let sub = 0;
    if (selectedBundleId && bundles) {
      const bundle = bundles.find((b) => b.id === selectedBundleId);
      if (bundle) {
        sub = Number(bundle.basePrice);
      }
    } else if (items) {
      for (const item of items) {
        if (checkedItemIds.has(item.id)) {
          sub += Number(item.basePrice);
        }
      }
    }
    const vatAmount = Math.round(sub * VAT_RATE);
    return { subtotal: sub, vat: vatAmount, total: sub + vatAmount };
  }, [selectedBundleId, bundles, checkedItemIds, items]);

  // Notify parent on selection change
  useEffect(() => {
    if (!onSelectionChange) return;
    onSelectionChange({
      bundleId: selectedBundleId,
      itemIds: Array.from(checkedItemIds),
      subtotal,
      vat,
      total,
    });
  }, [selectedBundleId, checkedItemIds, subtotal, vat, total, onSelectionChange]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const activeBundles = (bundles ?? []).filter((b) => b.active);
  const activeItems = (items ?? []).filter((i) => i.active).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6">
      {/* Bundle Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {activeBundles.map((bundle) => {
          const isSelected = selectedBundleId === bundle.id;
          return (
            <div
              key={bundle.id}
              className={`relative flex flex-col rounded-xl border-2 bg-card p-6 shadow-sm transition-all ${
                isSelected
                  ? "border-primary shadow-md"
                  : "border-border/60 hover:border-border"
              }`}
            >
              {isSelected && (
                <div className="absolute right-4 top-4 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              )}
              <div className="mb-4">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  {bundle.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{bundle.description}</p>
                <p className="mt-3 text-2xl font-bold text-primary">
                  {formatNgn(Number(bundle.basePrice))}
                </p>
              </div>

              <ul className="mb-6 flex-1 space-y-1.5">
                {bundle.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                    {item.name}
                  </li>
                ))}
              </ul>

              <Button
                variant={isSelected ? "default" : "outline"}
                className="w-full"
                onClick={() => handleSelectBundle(bundle)}
              >
                {isSelected ? "Selected" : "Select"}
              </Button>
            </div>
          );
        })}
      </div>

      {/* À-la-carte section */}
      <div className="rounded-xl border border-border/60 bg-card">
        <button
          type="button"
          className="flex w-full items-center justify-between px-6 py-4 text-left"
          onClick={() => setAlaCarteOpen((v) => !v)}
          aria-expanded={alaCarteOpen}
        >
          <div>
            <span className="text-base font-semibold text-foreground">À-la-carte services</span>
            <span className="ml-2 text-sm text-muted-foreground">
              ({checkedItemIds.size} selected)
            </span>
          </div>
          {alaCarteOpen ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {alaCarteOpen && (
          <div className="border-t border-border/60 px-6 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activeItems.map((item) => {
                const checked = checkedItemIds.has(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-secondary/40"
                  >
                    <Checkbox
                      id={`item-${item.id}`}
                      checked={checked}
                      onCheckedChange={() => handleToggleItem(item)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                      <p className="mt-1 text-xs font-semibold text-primary">
                        {formatNgn(Number(item.basePrice))}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Running Total */}
      <div className="rounded-xl border border-border/60 bg-card px-6 py-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Order Summary
        </h3>
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
          <div className="flex justify-between text-base font-bold text-foreground">
            <span>Total</span>
            <span className="text-primary">{formatNgn(total)}</span>
          </div>
        </div>

        {total > 0 && (
          <Button
            className="mt-4 w-full"
            onClick={() => {
              if (onSelectionChange) {
                onSelectionChange({
                  bundleId: selectedBundleId,
                  itemIds: Array.from(checkedItemIds),
                  subtotal,
                  vat,
                  total,
                });
              }
            }}
          >
            Confirm selection
          </Button>
        )}
      </div>
    </div>
  );
}
