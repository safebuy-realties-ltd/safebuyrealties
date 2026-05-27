import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { uploadKycDocument, useMyKycQuery, useSubmitKycMutation } from "@/hooks/use-kyc";
import {
  kycCanSubmit,
  kycStatusBadgeClass,
  kycStatusLabel,
  kycStatusMessage,
} from "@/lib/kyc-status";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/buyer/kyc")({
  component: BuyerKyc,
});

type UploadSlot = {
  label: string;
  key: string | null;
  fileName: string | null;
};

const INITIAL_SLOTS: UploadSlot[] = [
  { label: "Government-issued ID", key: null, fileName: null },
  { label: "Selfie or utility bill", key: null, fileName: null },
];

function BuyerKyc() {
  const { data: kyc, isLoading } = useMyKycQuery();
  const submit = useSubmitKycMutation();
  const [slots, setSlots] = useState<UploadSlot[]>(INITIAL_SLOTS);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const status = kyc?.status ?? "NOT_SUBMITTED";
  const canSubmit = kycCanSubmit(status);

  const handleFileChange = async (index: number, file: File | undefined) => {
    if (!file) return;
    setUploadingIndex(index);
    try {
      const uploaded = await uploadKycDocument(file);
      setSlots((prev) =>
        prev.map((slot, i) =>
          i === index ? { ...slot, key: uploaded.storageKey, fileName: file.name } : slot,
        ),
      );
      toast.success(`${INITIAL_SLOTS[index].label} uploaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingIndex(null);
    }
  };

  const handleSubmit = async () => {
    const keys = slots.map((s) => s.key).filter((k): k is string => !!k);
    if (keys.length < 2) {
      toast.error("Please upload both required documents before submitting.");
      return;
    }
    try {
      await submit.mutateAsync(keys);
      toast.success("Identity documents submitted for review.");
      setSlots(INITIAL_SLOTS);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not submit KYC.");
    }
  };

  return (
    <>
      <PageHeader
        title="Verify Your Identity"
        description="Complete KYC verification before purchasing property on SafeBuyRealties."
      />

      <div className="mb-6 rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Status</span>
          {isLoading ? (
            <span className="text-sm text-muted-foreground">Loading…</span>
          ) : (
            <Badge variant="outline" className={kycStatusBadgeClass(status)}>
              {kycStatusLabel(status)}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-sm text-foreground">{kycStatusMessage(status, kyc?.reviewNote)}</p>
      </div>

      {canSubmit && (
        <div className="max-w-xl space-y-6 rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">
            Upload a clear photo of your government ID and a recent selfie or utility bill showing
            your address.
          </p>
          {slots.map((slot, index) => (
            <div key={slot.label} className="space-y-2">
              <Label htmlFor={`kyc-file-${index}`}>{slot.label}</Label>
              <input
                id={`kyc-file-${index}`}
                type="file"
                accept="image/*,application/pdf"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                disabled={uploadingIndex !== null || submit.isPending}
                onChange={(e) => void handleFileChange(index, e.target.files?.[0])}
              />
              {slot.fileName && (
                <p className="text-xs text-muted-foreground">Selected: {slot.fileName}</p>
              )}
            </div>
          ))}
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submit.isPending || uploadingIndex !== null}
          >
            {submit.isPending ? "Submitting…" : "Submit for review"}
          </Button>
        </div>
      )}
    </>
  );
}
