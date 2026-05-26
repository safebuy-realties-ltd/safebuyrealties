import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  usePlatformConfigQuery,
  useUpdatePlatformConfigMutation,
} from "@/hooks/use-platform-config";

export const Route = createFileRoute("/dashboard/admin/settings")({
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const { data, isLoading, isError, error, refetch } = usePlatformConfigQuery();
  const updateConfig = useUpdatePlatformConfigMutation();

  const [vatRate, setVatRate] = useState("");
  const [maxUploadMb, setMaxUploadMb] = useState("");
  const [paystackEnabled, setPaystackEnabled] = useState(true);
  const [flutterwaveEnabled, setFlutterwaveEnabled] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    if (!data) return;
    setVatRate(data.vatRate);
    setMaxUploadMb(String(data.maxUploadMb));
    setPaystackEnabled(data.paystackEnabled ?? true);
    setFlutterwaveEnabled(data.flutterwaveEnabled ?? false);
    setMaintenanceMode(data.maintenanceMode ?? false);
  }, [data]);

  const save = () => {
    const vat = Number(vatRate);
    const maxMb = Number(maxUploadMb);
    if (!Number.isFinite(vat) || vat < 0 || vat > 1) {
      toast.error("VAT rate must be between 0 and 1.");
      return;
    }
    if (!Number.isFinite(maxMb) || maxMb < 1 || maxMb > 100) {
      toast.error("Max upload must be between 1 and 100 MB.");
      return;
    }
    updateConfig.mutate(
      {
        vatRate: vat,
        maxUploadMb: maxMb,
        paystackEnabled,
        flutterwaveEnabled,
        maintenanceMode,
      },
      {
        onSuccess: () => toast.success("Platform settings saved."),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Save failed."),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="VAT rate, upload limits, payment providers, and maintenance mode."
      />

      {isError && (
        <p className="mb-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load settings."}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      )}

      <form
        className="max-w-xl space-y-6 rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && data && (
          <>
            <div className="space-y-2">
              <Label htmlFor="vatRate">VAT rate (decimal)</Label>
              <Input
                id="vatRate"
                type="number"
                step="0.001"
                min="0"
                max="1"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxUploadMb">Max upload (MB)</Label>
              <Input
                id="maxUploadMb"
                type="number"
                min="1"
                max="100"
                value={maxUploadMb}
                onChange={(e) => setMaxUploadMb(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="paystackEnabled">Paystack enabled</Label>
              <Switch
                id="paystackEnabled"
                checked={paystackEnabled}
                onCheckedChange={setPaystackEnabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="flutterwaveEnabled">Flutterwave enabled</Label>
              <Switch
                id="flutterwaveEnabled"
                checked={flutterwaveEnabled}
                onCheckedChange={setFlutterwaveEnabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="maintenanceMode">Maintenance mode</Label>
              <Switch
                id="maintenanceMode"
                checked={maintenanceMode}
                onCheckedChange={setMaintenanceMode}
              />
            </div>

            {data.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last updated {new Date(data.updatedAt).toLocaleString()}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={updateConfig.isPending}>
                {updateConfig.isPending ? "Saving…" : "Save settings"}
              </Button>
              <Button variant="outline" type="button" asChild>
                <Link to="/dashboard/admin">Back to overview</Link>
              </Button>
            </div>
          </>
        )}
      </form>
    </>
  );
}
