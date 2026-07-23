import { useRef, useState, type Ref } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Copy, Download, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StandaloneDdOrderDto } from "@/hooks/use-standalone-dd";
import { downloadElementAsPdf } from "@/lib/download-html-pdf";
import { toast } from "sonner";

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

/** Visual confirmation card — this exact DOM is rasterized into the downloaded PDF. */
export function DdRequestSummaryCard({
  order,
  cardRef,
}: {
  order: StandaloneDdOrderDto;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const checklist = order.checklistSummary ?? [];

  return (
    <div
      ref={cardRef}
      data-testid="dd-summary-card"
      className="overflow-hidden rounded-3xl border border-[#5c1f24]/25 bg-[#f7f1ea] shadow-[var(--shadow-card)]"
    >
      <div className="bg-[linear-gradient(135deg,#5c1f24_0%,#8b3a3f_55%,#c4784a_100%)] px-8 py-8 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(255,255,255,0.8)]">
          SafeBuyRealties
        </p>
        <h3 className="mt-3 text-3xl font-semibold tracking-tight">Due diligence request</h3>
        <p className="mt-2 max-w-xl text-sm text-[rgba(255,255,255,0.85)]">
          A designed summary of the schedules and checklist items you selected.
        </p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <div className="rounded-2xl bg-[rgba(255,255,255,0.15)] px-4 py-3 backdrop-blur">
            <p className="text-[rgba(255,255,255,0.7)]">Service ID</p>
            <p className="mt-1 font-mono font-semibold">{order.serviceId}</p>
          </div>
          <div className="rounded-2xl bg-[rgba(255,255,255,0.15)] px-4 py-3 backdrop-blur">
            <p className="text-[rgba(255,255,255,0.7)]">Case ID</p>
            <p className="mt-1 font-mono font-semibold">{order.caseId}</p>
          </div>
          <div className="rounded-2xl bg-[rgba(255,255,255,0.15)] px-4 py-3 backdrop-blur">
            <p className="text-[rgba(255,255,255,0.7)]">Status</p>
            <p className="mt-1 font-semibold">{formatStatus(order.status)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 px-8 py-8 md:grid-cols-2">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b3a3f]">Client</p>
          <p className="mt-2 text-lg font-semibold text-[#2b1a16]">{order.guestName}</p>
          <p className="mt-1 text-sm text-[#5c433a]">{order.guestEmail}</p>
          <p className="text-sm text-[#5c433a]">{order.guestPhone}</p>
        </section>
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b3a3f]">
            Property
          </p>
          <p className="mt-2 text-lg font-semibold text-[#2b1a16]">
            {order.property?.title ?? "Standalone property"}
          </p>
          <p className="mt-1 text-sm text-[#5c433a]">
            {order.property?.location ?? "Location unavailable"}
          </p>
        </section>
      </div>

      <div className="space-y-5 px-8 pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b3a3f]">
          Selected checks
        </p>
        {checklist.length === 0 ? (
          <p className="text-sm text-[#5c433a]">No checklist details were stored for this case.</p>
        ) : (
          checklist.map((schedule) => (
            <section
              key={schedule.code}
              className="rounded-2xl border border-[#5c1f24]/15 bg-[rgba(255,255,255,0.8)] p-5"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#5c1f24] text-sm font-semibold text-white">
                  {schedule.letter}
                </span>
                <div>
                  <h4 className="font-semibold text-[#2b1a16]">{schedule.name}</h4>
                  <p className="text-xs text-[#8b3a3f]">
                    {schedule.items.length} item{schedule.items.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {schedule.items.map((item) => (
                  <li
                    key={item.code}
                    className="flex items-start gap-2 rounded-xl bg-[#f7f1ea] px-3 py-2 text-sm text-[#2b1a16]"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b3a3f]" />
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <div className="rounded-2xl border border-dashed border-[#8b3a3f]/40 bg-[#fff8f1] px-5 py-4 text-sm text-[#5c433a]">
          <p className="font-medium text-[#2b1a16]">What happens next</p>
          <p className="mt-1">
            {order.pricingNote ??
              "Our team will calculate a tailored quote from your selections and contact you to confirm payment and kick off the review."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function DdOrderConfirmation({
  order,
  isAuthenticatedBuyer = false,
}: {
  order: StandaloneDdOrderDto;
  isAuthenticatedBuyer?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const copyServiceId = async () => {
    try {
      await navigator.clipboard.writeText(order.serviceId);
      setCopied(true);
      toast.success("Service ID copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy Service ID. Please copy it manually.");
    }
  };

  const handleDownloadPdf = async () => {
    if (!summaryRef.current) return;
    setDownloading(true);
    try {
      await downloadElementAsPdf(summaryRef.current, {
        filename: `safebuy-dd-request-${order.serviceId}.pdf`,
        widthPx: 794,
        backgroundColor: "#f7f1ea",
        marginPt: 18,
      });
      toast.success("PDF downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge className="border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]">
            Request submitted
          </Badge>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            Your due diligence request is with our team
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Pricing is quote-based. SafeBuyRealties will review your selected checks and reach out
            to confirm the fee before work begins.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void copyServiceId()}>
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Copied" : "Copy Service ID"}
          </Button>
          <Button
            data-testid="dd-download-pdf"
            onClick={() => void handleDownloadPdf()}
            disabled={downloading}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Preparing PDF…" : "Download PDF"}
          </Button>
        </div>
      </div>

      <DdRequestSummaryCard order={order} cardRef={summaryRef} />

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/due-diligence">
            <Mail className="mr-2 h-4 w-4" />
            Look up another case
          </Link>
        </Button>
        {isAuthenticatedBuyer ? (
          <Button asChild>
            <Link to="/dashboard/buyer/due-diligence">
              Open my due diligence
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
