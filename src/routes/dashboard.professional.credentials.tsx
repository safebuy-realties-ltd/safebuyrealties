import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  isProfessionalProfileComplete,
  isProfessionalProfilePendingReview,
  useMyProfileQuery,
  useUpdateMyProfileMutation,
  useUploadProfessionalDocumentMutation,
} from "@/hooks/use-professional-profile";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/professional/credentials")({
  component: ProCredentials,
});

function statusBadge(status: "not_started" | "in_progress" | "pending" | "verified" | "rejected") {
  switch (status) {
    case "verified":
      return <Badge variant="default">Verified</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending review</Badge>;
    case "in_progress":
      return <Badge variant="outline">Onboarding in progress</Badge>;
    default:
      return <Badge variant="outline">Not submitted</Badge>;
  }
}

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function ProCredentials() {
  const profileQuery = useMyProfileQuery();
  const { data: profile, isLoading } = profileQuery;
  const update = useUpdateMyProfileMutation();
  const upload = useUploadProfessionalDocumentMutation();

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

  const profileStatus = useMemo(() => {
    if (!profile) return "not_started" as const;
    if (profile.verifiedStatus === "VERIFIED") return "verified" as const;
    if (profile.verifiedStatus === "REJECTED") return "rejected" as const;
    if (isProfessionalProfilePendingReview(profile)) return "pending" as const;
    if (profile.regulatoryBody || profile.licenseNumber || profile.licenseDocumentKey || profile.idDocumentKey) {
      return "in_progress" as const;
    }
    return "not_started" as const;
  }, [profile]);

  const canSubmit = isProfessionalProfileComplete(profile);
  const readyForReview = Boolean(
    regulatoryBody.trim() &&
      licenseNumber.trim() &&
      profile?.licenseDocumentKey &&
      profile?.idDocumentKey,
  );

  const handleUpload = async (kind: "license" | "id", file: File | undefined) => {
    if (!file) return;
    try {
      await upload.mutateAsync({ kind, file });
      await profileQuery.refetch();
      toast.success(`${kind === "license" ? "License" : "ID"} document uploaded.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not upload document.");
    }
  };

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
      await profileQuery.refetch();
      toast.success(
        readyForReview
          ? "Credentials updated. Staff will review your submission."
          : "Credentials saved. Upload both documents to complete onboarding.",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save credentials.");
    }
  };

  return (
    <>
      <PageHeader
        title="My Credentials"
        description="Manage your licensing details, upload supporting documents, and resubmit if staff requests changes."
      />

      <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
        <span className="text-sm font-medium text-muted-foreground">Verification status:</span>
        {isLoading ? (
          <span className="text-sm text-muted-foreground">Loading…</span>
        ) : (
          statusBadge(profileStatus)
        )}
      </div>

      {profileStatus === "pending" && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
          <p className="text-sm font-medium text-foreground">
            Your onboarding package is complete and waiting for staff review.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Staff can approve you for assignments or reject the submission with a note if they need
            changes.
          </p>
        </div>
      )}

      {(profileStatus === "not_started" || profileStatus === "in_progress") && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary-soft/30 p-5">
          <p className="text-sm font-medium text-foreground">Need the guided flow?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the onboarding wizard to complete your profile step by step, then return here any
            time to update or replace documents.
          </p>
          <Button className="mt-4" size="sm" variant="outline" asChild>
            <Link to="/onboarding/professional">Open onboarding wizard</Link>
          </Button>
        </div>
      )}

      {profile?.verifiedStatus === "REJECTED" && profile.rejectionNote && (
        <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <p className="text-sm font-medium text-destructive">Rejection note</p>
          <p className="mt-1 text-sm text-foreground">{profile.rejectionNote}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]"
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
            Saving or replacing any credential resets your verification status until staff reviews
            the latest submission.
          </p>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending
              ? "Saving…"
              : profile?.verifiedStatus === "REJECTED"
                ? "Save and resubmit"
                : "Save credentials"}
          </Button>
        </form>

        <div className="space-y-4 rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Required documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Staff review requires a license upload and a matching ID.
            </p>
          </div>

          {[
            {
              kind: "license" as const,
              label: "Professional license",
              key: profile?.licenseDocumentKey,
              url: profile?.licenseDocumentUrl,
            },
            {
              kind: "id" as const,
              label: "Government-issued ID",
              key: profile?.idDocumentKey,
              url: profile?.idDocumentUrl,
            },
          ].map((item) => (
            <div key={item.kind} className="rounded-xl border border-border/60 bg-secondary/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                {item.key ? (
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-700">
                    Uploaded
                  </Badge>
                ) : (
                  <Badge variant="outline">Missing</Badge>
                )}
              </div>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="mt-4 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                disabled={upload.isPending}
                onChange={(e) => void handleUpload(item.kind, e.target.files?.[0])}
              />
              {item.url && (
                <div className="mt-3">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-primary underline"
                  >
                    View uploaded file
                  </a>
                </div>
              )}
            </div>
          ))}

          <div className="rounded-xl border border-dashed border-border/60 p-4">
            <p className="text-sm font-medium text-foreground">
              Submission completeness: {canSubmit ? "Ready for review" : "More details required"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add license details and both documents to appear in the staff review queue.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
