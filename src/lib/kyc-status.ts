export function kycStatusMessage(status: string, reviewNote?: string | null): string {
  switch (status) {
    case "NOT_SUBMITTED":
      return "Please verify your identity to complete property purchases.";
    case "SUBMITTED":
      return "Your documents are under review — we'll notify you when complete.";
    case "VERIFIED":
      return "Identity Verified ✓";
    case "REJECTED":
      return reviewNote?.trim()
        ? `Verification rejected: ${reviewNote.trim()}`
        : "Verification rejected. Please resubmit your documents.";
    default:
      return "Identity verification status unknown.";
  }
}

export function kycCanSubmit(status: string): boolean {
  return status === "NOT_SUBMITTED" || status === "REJECTED";
}

export function kycStatusBadgeClass(status: string): string {
  switch (status) {
    case "VERIFIED":
      return "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]";
    case "SUBMITTED":
      return "border-primary/20 bg-primary-soft text-primary";
    case "REJECTED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]";
  }
}

export function kycStatusLabel(status: string): string {
  switch (status) {
    case "NOT_SUBMITTED":
      return "Not submitted";
    case "SUBMITTED":
      return "Under review";
    case "VERIFIED":
      return "Verified";
    case "REJECTED":
      return "Rejected";
    default:
      return status.replace(/_/g, " ");
  }
}
