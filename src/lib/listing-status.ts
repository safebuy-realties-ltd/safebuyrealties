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
    case "UNDER_OFFER":
      return "Under Offer";
    case "SOLD":
      return "Sold";
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
    case "UNDER_OFFER":
      return "border-blue-300/30 bg-blue-100/50 text-blue-700 dark:text-blue-300";
    case "REJECTED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "SOLD":
    case "ARCHIVED":
    case "DRAFT":
    default:
      return "border-border text-muted-foreground";
  }
}

/** Buyers only see listings with this status on public browse surfaces. */
export function statusIsPublic(status: string, isPublished?: boolean): boolean {
  if (isPublished === false) return false;
  return status === "LIVE" || status === "UNDER_OFFER";
}

/** Whether a listing detail page is visible without authentication. */
export function listingIsPubliclyViewable(status: string, isPublished?: boolean): boolean {
  if (isPublished === false) return false;
  return status === "LIVE" || status === "UNDER_OFFER";
}

/**
 * Whether the API will hand this listing to somebody with no session, which is the only question a
 * sitemap entry or a server-rendered `<title>` is allowed to answer.
 *
 * This deliberately mirrors `isPubliclyVisible` in `backend/src/listings/listings-public.helper.ts`
 * rather than reusing `listingIsPubliclyViewable` above, because the two rules are not the same and
 * the backend is the one that decides. The backend serves `LIVE` whatever `isPublished` says, and
 * serves `VERIFIED` only when it is published. The UI predicate is stricter on both counts, and every
 * listing seeded so far is `LIVE` with `isPublished` false, so reusing it here would have produced an
 * empty sitemap and a metadata-free listing page on a site that has listings to show.
 *
 * The divergence between the two is real and predates this change; it is written up for follow-up
 * rather than fixed here, because widening the UI predicate also moves the checkout gate.
 */
export function listingIsPubliclyIndexable(status: string, isPublished?: boolean): boolean {
  return status === "LIVE" || (status === "VERIFIED" && isPublished === true);
}
