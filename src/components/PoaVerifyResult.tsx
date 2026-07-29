import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PoaVerifyDto } from "@/hooks/use-poa";

export type PoaVerifyResultProps = {
  hash?: string;
  isLoading: boolean;
  isError: boolean;
  data?: PoaVerifyDto;
};

function formatExecutedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
      {children}
    </section>
  );
}

function SupportLink() {
  return (
    <Button asChild variant="outline" className="mt-6">
      <Link to="/due-diligence">Contact SafeBuyRealties</Link>
    </Button>
  );
}

export function PoaVerifyResult({ hash, isLoading, isError, data }: PoaVerifyResultProps) {
  if (!hash) {
    return (
      <Panel>
        <div className="flex flex-col items-center text-center">
          <ScanLine className="h-10 w-10 text-muted-foreground" aria-hidden />
          <h2 className="mt-4 text-xl font-semibold">No document hash supplied</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Scan the QR code printed on a SafeBuyRealties Power of Attorney, or open a verification
            link that ends in <span className="font-mono">?hash=</span> followed by the 64-character
            document hash.
          </p>
        </div>
      </Panel>
    );
  }

  if (isLoading) {
    return (
      <Panel>
        <div className="flex flex-col items-center text-center text-sm text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
          <p className="mt-4">Checking the register…</p>
        </div>
      </Panel>
    );
  }

  if (isError || !data) {
    return (
      <Panel>
        <div className="flex flex-col items-center text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            aria-hidden
          >
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold">No matching document</h2>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            No Power of Attorney on the SafeBuyRealties register has this document hash. The
            document may have been altered, or the hash may have been mistyped.
          </p>
          <dl className="mt-6 w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left text-sm">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hash checked
            </dt>
            <dd className="mt-1 break-all font-mono">{hash}</dd>
          </dl>
          <SupportLink />
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-col items-center text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success"
          aria-hidden
        >
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold">Power of Attorney verified</h2>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          This document is recorded on the SafeBuyRealties register and has not been altered since
          execution.
        </p>
      </div>

      <dl className="mt-8 space-y-4 rounded-xl border border-border/60 bg-muted/20 p-5 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Property
          </dt>
          <dd className="mt-1 font-medium text-foreground">{data.listingTitle}</dd>
          <dd className="text-muted-foreground">{data.listingAddress}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Executed on
          </dt>
          <dd className="mt-1 font-medium text-foreground">{formatExecutedAt(data.executedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Document hash (SHA-256)
          </dt>
          <dd className="mt-1 break-all font-mono text-xs">{data.documentHash}</dd>
        </div>
      </dl>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Parties, contact details and transaction values are never shown on this page.
      </p>
    </Panel>
  );
}
