import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

/** One report, plus the credential that makes its URL work and the moment that credential dies. */
export type DdReportLink = {
  key: string;
  fileName: string;
  url: string;
  expiresAt: string;
};

export type DdReportsDto = {
  orderId: string;
  status: string;
  /** When the whole answer stops working, present even when `reports` is empty. */
  expiresAt: string;
  reports: DdReportLink[];
};

export const DD_REPORTS_QUERY_KEY = ["due-diligence", "reports"] as const;

/**
 * Fetches download links for the reports on one due diligence case (E1-S3).
 *
 * Two things about this endpoint make it unlike the rest of the read hooks in here. Every call
 * mints new credentials and writes an audit row per link, so asking for links the buyer has not
 * asked to download would fill the audit trail with issues nobody made. And the links it returns
 * stop working after fifteen minutes, so an answer held in cache is a button that quietly turns
 * into a 403.
 *
 * Both are answered the same way: nothing is fetched until `enabled` says the buyer asked, and
 * nothing is kept afterwards. `staleTime: 0` with `gcTime: 0` means a second visit signs fresh
 * links rather than handing back the old ones, which is the behaviour a short-lived link needs.
 */
export function useDdReportsQuery(orderId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...DD_REPORTS_QUERY_KEY, orderId],
    queryFn: () => apiRequest<DdReportsDto>(`/due-diligence-orders/${orderId}/reports`),
    select: (envelope) => envelope.data,
    enabled: Boolean(orderId) && (options.enabled ?? true),
    staleTime: 0,
    gcTime: 0,
    // A 404 here is the answer, not a hiccup: it is what a case belonging to somebody else, and a
    // session that has run out, both return. Retrying it three times would mean three trips to say
    // the same thing, and would make the screen look slow while it did.
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** True once `expiresAt` has passed. Split out so the countdown has something to test. */
export function isLinkExpired(expiresAt: string, now: number = Date.now()): boolean {
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) ? true : at <= now;
}

/**
 * How long is left, in the words a person would use. Rounds up, because a link with forty seconds
 * on it reading "0 minutes left" invites the buyer to give up on a link that still works.
 */
export function expiresInWords(expiresAt: string, now: number = Date.now()): string {
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return "expired";
  const minutes = Math.ceil(remaining / 60_000);
  return minutes === 1 ? "1 minute left" : `${minutes} minutes left`;
}
