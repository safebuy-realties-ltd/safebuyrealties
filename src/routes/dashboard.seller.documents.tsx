import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { DashboardLayout, PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, CheckCircle2, Scale, Map, Building2, Receipt, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useListingsQuery } from "@/hooks/use-listings";
import { useListingDocumentsQuery, useUploadDocumentMutation } from "@/hooks/use-documents";
import { useVerificationListingQuery } from "@/hooks/use-verification";
import { useUpdateListingMutation } from "@/hooks/use-update-listing";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/seller/documents")({
  component: () => (
    <DashboardLayout role="seller">
      <SellerDocuments />
    </DashboardLayout>
  ),
});

type DocType = "title_deed" | "survey_plan" | "building_approval" | "tax_receipt" | "other";

const docTypes: { id: DocType; label: string; desc: string; icon: typeof Scale; required: boolean }[] = [
  { id: "title_deed", label: "Title Deed", desc: "Certificate of Occupancy or equivalent", icon: Scale, required: true },
  { id: "survey_plan", label: "Survey Plan", desc: "Registered surveyor's plan", icon: Map, required: true },
  { id: "building_approval", label: "Building Approval", desc: "Government building permit", icon: Building2, required: false },
  { id: "tax_receipt", label: "Tax Receipts", desc: "Recent property tax payments", icon: Receipt, required: false },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(category: string) {
  const d = docTypes.find((t) => t.id === category);
  return d?.label ?? category.replace(/_/g, " ");
}

function userVisibleApiError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN" || error.code === "HTTP_401") {
      return "Your session has expired or you do not have access. Please sign in again.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

function SellerDocuments() {
  const qc = useQueryClient();
  const { data: listingsData, isLoading: listingsLoading, isError: listingsIsError, error: listingsErr } =
    useListingsQuery();
  const listings = listingsData?.listings ?? [];

  const [listingId, setListingId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<DocType>("title_deed");
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedListing = listings.find((l) => l.id === (listingId ?? "")) ?? null;

  useEffect(() => {
    if (listings.length === 0) {
      setListingId(null);
      return;
    }
    if (!listingId || !listings.some((l) => l.id === listingId)) {
      setListingId(listings[0].id);
    }
  }, [listings, listingId]);

  const {
    data: documents,
    isLoading: docsLoading,
    isError: docsError,
    error: docsErr,
    refetch: refetchDocs,
  } = useListingDocumentsQuery(listingId);

  useEffect(() => {
    if (listingId) void refetchDocs();
  }, [listingId, refetchDocs]);

  const uploadMutation = useUploadDocumentMutation();
  const updateListing = useUpdateListingMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    data: verificationSteps,
    isLoading: verificationLoading,
    isError: verificationError,
    error: verificationErr,
    refetch: refetchVerification,
  } = useVerificationListingQuery(listingId ?? "", !!listingId);

  const countByType = (t: DocType) => (documents ?? []).filter((d) => d.category === t).length;
  const missingRequiredDocs = docTypes
    .filter((d) => d.required)
    .filter((d) => countByType(d.id) === 0)
    .map((d) => d.label);

  const canSubmitForReview =
    !!listingId &&
    missingRequiredDocs.length === 0 &&
    !!selectedListing &&
    (selectedListing.status === "DRAFT" || selectedListing.status === "REJECTED");

  const submitForReview = () => {
    if (!listingId || !canSubmitForReview) return;
    setSubmitError(null);
    updateListing.mutate(
      { id: listingId, body: { status: "PENDING_REVIEW" } },
      {
        onSuccess: async () => {
          toast.success("Submitted for review. Our team will verify your documents.");
          void qc.invalidateQueries({ queryKey: ["verification", "listing", listingId] });
          await refetchVerification();
        },
        onError: (e) => {
          const msg = e instanceof ApiError ? e.message : "Could not submit.";
          setSubmitError(msg);
          toast.error(msg);
        },
      },
    );
  };

  const processFiles = useCallback(
    async (list: FileList | null) => {
      if (!list?.length || !listingId) return;
      setUploadError(null);
      const files = Array.from(list);
      for (const file of files) {
        try {
          await uploadMutation.mutateAsync({
            listingId,
            category: activeType,
            file,
          });
        } catch (e) {
          const msg = userVisibleApiError(e, "Upload failed");
          setUploadError(msg);
          break;
        }
      }

      void refetchDocs();
    },
    [listingId, activeType, refetchDocs, uploadMutation],
  );

  const handleFiles = (list: FileList | null) => {
    void processFiles(list);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = "";
  };

  return (
    <>
      <PageHeader
        title="Documents"
        description="Upload and manage verification documents for your listings."
      />

      {listingsIsError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {userVisibleApiError(listingsErr, "Could not load listings.")}
        </div>
      )}

      <div className="mb-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Listing</p>
        {listingsLoading ? (
          <p className="text-sm text-muted-foreground">Loading listings…</p>
        ) : listings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a listing before uploading documents.</p>
        ) : (
          <Select value={listingId ?? undefined} onValueChange={(v) => setListingId(v)}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select listing" />
            </SelectTrigger>
            <SelectContent>
              {listings.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title} ({l.status.replace(/_/g, " ")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          <p className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Document type
          </p>
          {docTypes.map((d) => {
            const active = activeType === d.id;
            const count = countByType(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveType(d.id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  active
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <d.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{d.label}</span>
                    {d.required && (
                      <Badge
                        variant="outline"
                        className="border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)] text-[10px]"
                      >
                        Required
                      </Badge>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">{d.desc}</span>
                </span>
                {count > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-success/15 px-1.5 text-[10px] font-semibold text-[oklch(0.4_0.12_155)]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        <section>
          {docsError && listingId && (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {userVisibleApiError(docsErr, "Could not load documents.")}{" "}
              <button type="button" className="ml-2 underline" onClick={() => void refetchDocs()}>
                Retry
              </button>
            </div>
          )}
          {uploadError && (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {uploadError}
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver ? "border-primary bg-primary-soft" : "border-border bg-secondary/40"
            } ${!listingId || uploadMutation.isPending ? "pointer-events-none opacity-60" : ""}`}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              Drag and drop {docTypes.find((d) => d.id === activeType)?.label.toLowerCase()} files here
            </p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG up to 15MB each (API limit)</p>
            <Button
              className="mt-5"
              disabled={!listingId || uploadMutation.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {uploadMutation.isPending ? "Uploading…" : "Browse files"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              disabled={!listingId || uploadMutation.isPending}
              onChange={onPick}
            />
          </div>

          <div className="mt-6 rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between border-b border-border/60 p-5">
              <h2 className="text-base font-semibold">Uploaded files</h2>
              <p className="text-xs text-muted-foreground">{documents?.length ?? 0} total</p>
            </div>
            <ul className="divide-y divide-border/60">
              {!listingId && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">Select a listing first.</li>
              )}
              {listingId && docsLoading && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">Loading documents…</li>
              )}
              {listingId && !docsLoading && (documents ?? []).length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">No files uploaded yet.</li>
              )}
              {listingId &&
                !docsLoading &&
                (documents ?? []).map((f) => (
                  <li key={f.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{f.fileName}</p>
                        <p className="text-xs text-muted-foreground">{formatSize(f.sizeBytes)}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{categoryLabel(f.category)}</span>
                        <span className="flex items-center gap-1 text-xs font-medium text-[oklch(0.4_0.12_155)]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 text-sm shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileCheck2 className="h-4 w-4 shrink-0 text-primary" />
                When required documents are uploaded, submit this listing for staff review. Staff assign professionals
                from their workflow.
              </div>
              {selectedListing && selectedListing.status !== "DRAFT" && selectedListing.status !== "REJECTED" && (
                <p className="text-xs text-muted-foreground">
                  This listing is{" "}
                  <span className="font-medium text-foreground">
                    {selectedListing.status.replace(/_/g, " ")}
                  </span>
                  . Submission for review is only available from Draft or Rejected.
                </p>
              )}
              {missingRequiredDocs.length > 0 && (
                <p className="text-xs text-destructive">Missing required categories: {missingRequiredDocs.join(", ")}</p>
              )}
              {submitError && <p className="text-xs text-destructive">{submitError}</p>}
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!canSubmitForReview || updateListing.isPending}
                  onClick={() => submitForReview()}
                >
                  {updateListing.isPending ? "Submitting…" : "Submit for verification"}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border/60 bg-card p-4 text-sm shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Verification status</h3>
              {verificationError && (
                <button className="text-xs underline" type="button" onClick={() => void refetchVerification()}>
                  Retry
                </button>
              )}
            </div>
            {verificationLoading && <p className="mt-2 text-muted-foreground">Loading verification details…</p>}
            {verificationError && (
              <p className="mt-2 text-destructive">
                {verificationErr instanceof Error ? verificationErr.message : "Failed to fetch verification details."}
              </p>
            )}
            {!verificationLoading && !verificationError && (verificationSteps ?? []).length === 0 && (
              <p className="mt-2 text-muted-foreground">No verification steps yet for this listing.</p>
            )}
            {(verificationSteps ?? []).length > 0 && (
              <ul className="mt-3 space-y-2">
                {verificationSteps?.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
                    <span>{s.label}</span>
                    <span className="text-xs text-muted-foreground">{s.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
