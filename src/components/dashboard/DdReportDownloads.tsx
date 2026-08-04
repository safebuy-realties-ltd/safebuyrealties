import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { expiresInWords, isLinkExpired, useDdReportsQuery } from "@/hooks/use-dd-reports";

export type DdReportDownloadsProps = {
  /** The due diligence order id, which is what `/due-diligence-orders/:id/reports` is keyed on. */
  orderId: string;
  status: string;
  /**
   * How many reports the case list already said were attached. Availability is answered from this
   * rather than from the links endpoint, because asking the links endpoint mints credentials and
   * writes an audit row for each one. Nobody should be recorded as having been handed a download
   * because a table happened to render.
   */
  reportCount: number;
};

const COMPLETE = "COMPLETE";

/**
 * Report availability and download state for one due diligence case (E1-S3 criterion 5).
 *
 * The two halves are deliberately fed from different places. Whether a report exists is already in
 * the case row, so the screen can say so for free. Getting the actual bytes is a separate,
 * deliberate act by the buyer, because the link it produces is a credential with a fifteen minute
 * life and an audit row behind it.
 *
 * The state worth spelling out is the third one: a case marked complete with nothing attached. It
 * is not an error and it is not "no reports yet", it is a case where the work finished and the
 * document has not landed, and a buyer who paid deserves to be told that in those words rather
 * than left looking at an empty cell.
 */
export function DdReportDownloads({ orderId, status, reportCount }: DdReportDownloadsProps) {
  const [requested, setRequested] = useState(false);
  const [expired, setExpired] = useState(false);
  const query = useDdReportsQuery(orderId, { enabled: requested });
  const { data, isFetching, isError, error, refetch } = query;
  const windowEndsAt = data?.expiresAt ?? null;

  // Flip to expired on the clock rather than only when the buyer next clicks, so a page left open
  // over lunch does not still show links that stopped working forty minutes ago.
  useEffect(() => {
    if (!windowEndsAt) return;
    if (isLinkExpired(windowEndsAt)) {
      setExpired(true);
      return;
    }
    setExpired(false);
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(windowEndsAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [windowEndsAt]);

  function request() {
    setExpired(false);
    setRequested(true);
    if (requested) void refetch();
  }

  if (reportCount === 0) {
    return status === COMPLETE ? (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Case complete, report not attached yet.</span>{" "}
        The work is finished and the document is still being filed. It will appear here, and we will
        email you when it does.
      </p>
    ) : (
      <p className="text-xs text-muted-foreground">
        No report yet. Reports appear here once the case is complete.
      </p>
    );
  }

  const links = data?.reports ?? [];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {reportCount === 1 ? "1 report ready" : `${reportCount} reports ready`}
      </p>

      {!requested && (
        <Button type="button" size="sm" variant="outline" onClick={request}>
          Get download links
        </Button>
      )}

      {requested && isFetching && (
        <p className="text-xs text-muted-foreground">Preparing secure links…</p>
      )}

      {requested && isError && !isFetching && (
        <div className="flex flex-col items-start gap-1">
          <p className="text-xs text-destructive">
            {error instanceof ApiError && error.code === "NOT_FOUND"
              ? "These reports are not available to this account. Sign in again, or ask support if you believe this is wrong."
              : "Could not prepare the download links."}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={request}>
            Try again
          </Button>
        </div>
      )}

      {requested && !isFetching && !isError && expired && (
        <div className="flex flex-col items-start gap-1">
          <p className="text-xs text-muted-foreground">
            Those links have expired. They are good for a few minutes each, so nobody you forwarded
            one to can still open it.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={request}>
            Get fresh links
          </Button>
        </div>
      )}

      {requested && !isFetching && !isError && !expired && links.length > 0 && (
        <ul className="flex flex-col gap-1">
          {links.map((report) => (
            <li key={report.key}>
              <a
                href={report.url}
                target="_blank"
                rel="noreferrer"
                download={report.fileName}
                className="text-sm text-primary underline"
              >
                {report.fileName}
              </a>
              <span className="ml-2 text-xs text-muted-foreground">
                {expiresInWords(report.expiresAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {requested && !isFetching && !isError && !expired && links.length === 0 && data && (
        <p className="text-xs text-muted-foreground">
          The report is no longer attached to this case. Ask support to re-issue it.
        </p>
      )}
    </div>
  );
}
