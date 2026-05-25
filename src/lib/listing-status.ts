/** Backend listing status → user-facing label and badge styles. */

export function statusLabel(status: string): string {
  switch (status) {
    case "PENDING_REVIEW":
      return "Pending Review";
    case "IN_VERIFICATION":
    case "ASSIGNED":
      return "In Verification";
    case "VERIFIED":
      return "Verified";
    case "LIVE":
      return "Live";
    case "REJECTED":
      return "Rejected";
    case "DRAFT":
      return "Draft";
    case "ARCHIVED":
      return "Archived";
    default:
      return status.replace(/_/g, " ");
  }
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "LIVE":
      return "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]";
    case "VERIFIED":
      return "border-primary/20 bg-primary-soft text-primary";
    case "IN_VERIFICATION":
    case "ASSIGNED":
      return "border-primary/20 bg-primary-soft text-primary";
    case "PENDING_REVIEW":
      return "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]";
    case "REJECTED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "ARCHIVED":
    case "DRAFT":
    default:
      return "border-border text-muted-foreground";
  }
}

/** Buyers only see listings with this status on public browse surfaces. */
export function statusIsPublic(status: string): boolean {
  return status === "LIVE";
}
