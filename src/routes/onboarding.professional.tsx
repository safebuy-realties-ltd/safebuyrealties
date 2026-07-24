import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, FileBadge2, ShieldCheck, UploadCloud } from "lucide-react";
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
  type ProfessionalDocumentKind,
} from "@/hooks/use-professional-profile";
import { useAuth, dashboardPathForRole, navigateAfterAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/onboarding/professional")({
  component: ProfessionalOnboardingRoute,
});

const PROFESSIONAL_TYPE_LABELS: Record<string, string> = {
  LAWYER: "Lawyer",
  SURVEYOR: "Surveyor",
  VALUER: "Valuer",
  ARCHITECT: "Architect",
  ENGINEER: "Engineer",
  BUILDER: "Builder",
  QUANTITY_SURVEYOR: "Quantity surveyor",
};

const STEPS = [
  { id: 1, title: "Confirm your role" },
  { id: 2, title: "Add license details" },
  { id: 3, title: "Upload documents" },
  { id: 4, title: "Submit for review" },
] as const;

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function documentMeta(
  profile: ReturnType<typeof useMyProfileQuery>["data"],
  kind: ProfessionalDocumentKind,
) {
  if (!profile) return { key: null, url: null };
  return kind === "license"
    ? { key: profile.licenseDocumentKey, url: profile.licenseDocumentUrl }
    : { key: profile.idDocumentKey, url: profile.idDocumentUrl };
}

function ProfessionalOnboardingRoute() {
  const navigate = useNavigate();
  const { user, isReady, isAuthenticated } = useAuth();
  const profileQuery = useMyProfileQuery();
  const profile = profileQuery.data;
  const updateProfile = useUpdateMyProfileMutation();
  const uploadDocument = useUploadProfessionalDocumentMutation();

  const [step, setStep] = useState<(typeof STEPS)[number]["id"]>(1);
  const [regulatoryBody, setRegulatoryBody] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");

  const professionalTypeLabel = useMemo(() => {
    if (!user?.professionalType) return "Professional";
    return PROFESSIONAL_TYPE_LABELS[user.professionalType] ?? user.professionalType;
  }, [user?.professionalType]);

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated) {
      navigate({ to: "/login/professional", search: { redirect: "/onboarding/professional" } });
      return;
    }
    if (user && user.role !== "professional") {
      navigateAfterAuth(navigate, dashboardPathForRole(user.role));
    }
  }, [isAuthenticated, isReady, navigate, user]);

  useEffect(() => {
    if (!profile) return;
    setRegulatoryBody(profile.regulatoryBody);
    setLicenseNumber(profile.licenseNumber);
    setLicenseExpiry(toDateInput(profile.licenseExpiry));
    if (profile.verifiedStatus === "REJECTED" || profile.regulatoryBody || profile.licenseNumber) {
      setStep(2);
    }
    if (profile.licenseDocumentKey || profile.idDocumentKey) {
      setStep(3);
    }
  }, [profile]);

  const isLoading = !isReady || !isAuthenticated || !user || profileQuery.isLoading;
  const profileComplete = isProfessionalProfileComplete(profile);
  const pendingReview = isProfessionalProfilePendingReview(profile);
  const licenseDoc = documentMeta(profile, "license");
  const idDoc = documentMeta(profile, "id");

  const handleUpload = async (kind: ProfessionalDocumentKind, file: File | undefined) => {
    if (!file) return;
    try {
      await uploadDocument.mutateAsync({ kind, file });
      await profileQuery.refetch();
      toast.success(`${kind === "license" ? "License" : "ID"} document uploaded.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not upload document.");
    }
  };

  const handleSubmit = async () => {
    if (!regulatoryBody.trim() || !licenseNumber.trim()) {
      toast.error("Add your regulatory body and license number before submitting.");
      setStep(2);
      return;
    }
    if (!licenseDoc.key || !idDoc.key) {
      toast.error("Upload both your license and ID before submitting.");
      setStep(3);
      return;
    }
    try {
      await updateProfile.mutateAsync({
        regulatoryBody: regulatoryBody.trim(),
        licenseNumber: licenseNumber.trim(),
        licenseExpiry: licenseExpiry
          ? new Date(`${licenseExpiry}T00:00:00.000Z`).toISOString()
          : undefined,
      });
      await profileQuery.refetch();
      toast.success("Credentials submitted. Staff will review your onboarding shortly.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not submit onboarding.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30">
        <div className="text-sm text-muted-foreground">Loading onboarding…</div>
      </div>
    );
  }

  if (!user || user.role !== "professional") {
    return null;
  }

  if (profile?.verifiedStatus === "VERIFIED") {
    return (
      <div className="min-h-screen bg-secondary/30 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border/60 bg-card p-8 shadow-[var(--shadow-card)]">
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
          >
            Verified
          </Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
            Your professional profile is verified.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Staff has approved your credentials, so you can return to your dashboard and accept
            assignment-ready work.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/dashboard/professional">Open dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dashboard/professional/credentials">Review credentials</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (pendingReview) {
    return (
      <div className="min-h-screen bg-secondary/30 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border/60 bg-card p-8 shadow-[var(--shadow-card)]">
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">
            Pending review
          </Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
            Your onboarding is under staff review.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We have your license details and both required documents. Staff can now approve or
            reject your credentials from the review queue.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-secondary/40 p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Regulatory body
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">{profile?.regulatoryBody}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-secondary/40 p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                License number
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">{profile?.licenseNumber}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <Link to="/dashboard/professional/credentials">View submitted credentials</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/dashboard/professional">Go to dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl bg-hero-gradient p-8 text-white shadow-[var(--shadow-card)]">
            <Badge variant="secondary" className="border-0 bg-white/15 text-white">
              Professional onboarding
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Become an assignment-ready {professionalTypeLabel.toLowerCase()}.
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-white/80">
              Confirm your specialty, add your regulatory credentials, and upload your license plus
              a matching identity document so staff can verify you for transaction work.
            </p>

            {profile?.verifiedStatus === "REJECTED" && profile.rejectionNote && (
              <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-4">
                <p className="text-sm font-semibold text-white">Resubmission needed</p>
                <p className="mt-2 text-sm text-white/85">{profile.rejectionNote}</p>
              </div>
            )}

            <div className="mt-8 grid gap-3">
              {STEPS.map((item) => {
                const active = step === item.id;
                const complete =
                  item.id === 1
                    ? true
                    : item.id === 2
                      ? Boolean(regulatoryBody.trim() && licenseNumber.trim())
                      : item.id === 3
                        ? Boolean(licenseDoc.key && idDoc.key)
                        : profileComplete;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStep(item.id)}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-white/40 bg-white/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                        complete ? "bg-white text-primary" : "bg-white/15 text-white"
                      }`}
                    >
                      {complete ? "✓" : item.id}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">{item.title}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
            {step === 1 && (
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <BadgeCheck className="h-6 w-6" />
                </span>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
                  Confirm your specialty
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your account is set up as a {professionalTypeLabel.toLowerCase()}. We’ll use this
                  to route the right verification tasks once your credentials are approved.
                </p>
                <div className="mt-6 rounded-2xl border border-border/60 bg-secondary/40 p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Account type
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {professionalTypeLabel}
                  </p>
                </div>
                <Button className="mt-6" onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                  <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
                    Add your licensing details
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Use the regulatory body and license number that staff should validate before
                    assigning you to live work.
                  </p>
                </div>

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
                    placeholder="e.g. NBA/2026/0042"
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

                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      if (!regulatoryBody.trim() || !licenseNumber.trim()) {
                        toast.error("Regulatory body and license number are required.");
                        return;
                      }
                      setStep(3);
                    }}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <UploadCloud className="h-6 w-6" />
                  </span>
                  <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
                    Upload your documents
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Upload a clear copy of your license and a matching government-issued ID. Each
                    upload saves immediately to your professional profile.
                  </p>
                </div>

                {[
                  {
                    kind: "license" as const,
                    label: "Professional license",
                    key: licenseDoc.key,
                    url: licenseDoc.url,
                  },
                  {
                    kind: "id" as const,
                    label: "Government-issued ID",
                    key: idDoc.key,
                    url: idDoc.url,
                  },
                ].map((item) => (
                  <div
                    key={item.kind}
                    className="rounded-2xl border border-border/60 bg-secondary/30 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.key
                            ? "Uploaded and attached to your profile."
                            : "Required before submission."}
                        </p>
                      </div>
                      {item.key ? (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-700">
                          Uploaded
                        </Badge>
                      ) : (
                        <Badge variant="outline">Missing</Badge>
                      )}
                    </div>
                    <input
                      className="mt-4 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={uploadDocument.isPending}
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

                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      if (!licenseDoc.key || !idDoc.key) {
                        toast.error("Upload both documents before continuing.");
                        return;
                      }
                      setStep(4);
                    }}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <FileBadge2 className="h-6 w-6" />
                </span>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
                  Submit for staff review
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Review the information below, then submit your onboarding package to the staff
                  credentials queue.
                </p>

                <div className="mt-6 space-y-4 rounded-2xl border border-border/60 bg-secondary/30 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Professional type
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {professionalTypeLabel}
                      </p>
                    </div>
                    <Badge variant="outline">Ready to submit</Badge>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Regulatory body
                    </p>
                    <p className="mt-1 text-sm text-foreground">{regulatoryBody || "Missing"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      License number
                    </p>
                    <p className="mt-1 text-sm text-foreground">{licenseNumber || "Missing"}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-background p-4">
                      <p className="text-sm font-medium text-foreground">Professional license</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {licenseDoc.key ? "Uploaded" : "Missing"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background p-4">
                      <p className="text-sm font-medium text-foreground">Government-issued ID</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {idDoc.key ? "Uploaded" : "Missing"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => setStep(3)}>
                    Back
                  </Button>
                  <Button onClick={() => void handleSubmit()} disabled={updateProfile.isPending}>
                    {updateProfile.isPending ? "Submitting…" : "Submit onboarding"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
