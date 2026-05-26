import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout, PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useMyProfileQuery, useUpdateMyProfileMutation } from "@/hooks/use-professional-profile";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/professional/credentials")({
  component: () => (
    <DashboardLayout role="professional">
      <ProCredentials />
    </DashboardLayout>
  ),
});

function statusBadge(status: string) {
  switch (status) {
    case "VERIFIED":
      return <Badge variant="default">Verified</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Rejected</Badge>;
    default:
      return <Badge variant="secondary">Pending review</Badge>;
  }
}

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function ProCredentials() {
  const { data: profile, isLoading } = useMyProfileQuery();
  const update = useUpdateMyProfileMutation();

  const [regulatoryBody, setRegulatoryBody] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");

  useEffect(() => {
    if (profile) {
      setRegulatoryBody(profile.regulatoryBody);
      setLicenseNumber(profile.licenseNumber);
      setLicenseExpiry(toDateInput(profile.licenseExpiry));
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regulatoryBody.trim() || !licenseNumber.trim()) {
      toast.error("Regulatory body and license number are required.");
      return;
    }
    try {
      await update.mutateAsync({
        regulatoryBody: regulatoryBody.trim(),
        licenseNumber: licenseNumber.trim(),
        licenseExpiry: licenseExpiry
          ? new Date(`${licenseExpiry}T00:00:00.000Z`).toISOString()
          : undefined,
      });
      toast.success("Credentials saved. Your profile is pending staff review.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save credentials.");
    }
  };

  return (
    <>
      <PageHeader
        title="My Credentials"
        description="Provide your professional licensing details for staff verification."
      />

      <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
        <span className="text-sm font-medium text-muted-foreground">Verification status:</span>
        {isLoading ? (
          <span className="text-sm text-muted-foreground">Loading…</span>
        ) : profile ? (
          statusBadge(profile.verifiedStatus)
        ) : (
          <Badge variant="outline">Not submitted</Badge>
        )}
      </div>

      {profile?.verifiedStatus === "REJECTED" && profile.rejectionNote && (
        <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <p className="text-sm font-medium text-destructive">Rejection note</p>
          <p className="mt-1 text-sm text-foreground">{profile.rejectionNote}</p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="max-w-xl space-y-5 rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]"
      >
        <div className="space-y-2">
          <Label htmlFor="regulatoryBody">Regulatory body</Label>
          <Input
            id="regulatoryBody"
            value={regulatoryBody}
            onChange={(e) => setRegulatoryBody(e.target.value)}
            placeholder="e.g. Nigerian Bar Association"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="licenseNumber">License number</Label>
          <Input
            id="licenseNumber"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="e.g. LIC-2026-0042"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="licenseExpiry">License expiry (optional)</Label>
          <Input
            id="licenseExpiry"
            type="date"
            value={licenseExpiry}
            onChange={(e) => setLicenseExpiry(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Saving any change resets your verification status to pending review.
        </p>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save credentials"}
        </Button>
      </form>
    </>
  );
}
