import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { DashboardLayout, PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle2, X, Scale, Map, Building2, Receipt, FileCheck2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/seller/documents")({
  component: () => (
    <DashboardLayout role="seller">
      <SellerDocuments />
    </DashboardLayout>
  ),
});

type DocType = "title_deed" | "survey_plan" | "building_approval" | "tax_receipt" | "other";

type DocFile = {
  id: string;
  name: string;
  size: number;
  type: DocType;
  progress: number; // 0..100
  status: "uploading" | "complete" | "error";
};

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

function SellerDocuments() {
  const [activeType, setActiveType] = useState<DocType>("title_deed");
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<DocFile[]>([
    { id: "f1", name: "Title-Deed-2024.pdf", size: 1.4 * 1024 * 1024, type: "title_deed", progress: 100, status: "complete" },
    { id: "f2", name: "Survey-Plan-LG.pdf", size: 820 * 1024, type: "survey_plan", progress: 100, status: "complete" },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);

  const simulateUpload = useCallback((file: File, type: DocType) => {
    const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const next: DocFile = { id, name: file.name, size: file.size, type, progress: 0, status: "uploading" };
    setFiles((prev) => [next, ...prev]);

    const tick = () => {
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id !== id) return f;
          const inc = Math.max(8, Math.round(Math.random() * 22));
          const p = Math.min(100, f.progress + inc);
          return { ...f, progress: p, status: p >= 100 ? "complete" : "uploading" };
        }),
      );
    };

    const interval = window.setInterval(() => {
      tick();
      setFiles((prev) => {
        const target = prev.find((f) => f.id === id);
        if (target && target.progress >= 100) {
          window.clearInterval(interval);
        }
        return prev;
      });
    }, 350);
  }, []);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    Array.from(list).forEach((f) => simulateUpload(f, activeType));
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

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const countByType = (t: DocType) =>
    files.filter((f) => f.type === t && f.status === "complete").length;

  return (
    <>
      <PageHeader
        title="Documents"
        description="Upload and manage verification documents for your listings."
      />

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
                onClick={() => setActiveType(d.id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  active
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  <d.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{d.label}</span>
                    {d.required && (
                      <Badge variant="outline" className="border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)] text-[10px]">Required</Badge>
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
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver ? "border-primary bg-primary-soft" : "border-border bg-secondary/40"
            }`}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              Drag and drop {docTypes.find((d) => d.id === activeType)?.label.toLowerCase()} files here
            </p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG up to 25MB each</p>
            <Button className="mt-5" onClick={() => inputRef.current?.click()}>
              Browse files
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={onPick}
            />
          </div>

          <div className="mt-6 rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between border-b border-border/60 p-5">
              <h2 className="text-base font-semibold">Uploaded files</h2>
              <p className="text-xs text-muted-foreground">{files.length} total</p>
            </div>
            <ul className="divide-y divide-border/60">
              {files.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No files uploaded yet.
                </li>
              )}
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{formatSize(f.size)}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {docTypes.find((d) => d.id === f.type)?.label ?? "Other"}
                      </span>
                      {f.status === "uploading" && (
                        <div className="flex flex-1 items-center gap-2">
                          <Progress value={f.progress} className="h-1.5 flex-1" />
                          <span className="text-xs tabular-nums text-muted-foreground">{f.progress}%</span>
                        </div>
                      )}
                      {f.status === "complete" && (
                        <span className="flex items-center gap-1 text-xs font-medium text-[oklch(0.4_0.12_155)]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(f.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border/60 bg-card p-4 text-sm shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileCheck2 className="h-4 w-4 text-primary" />
              Submit documents for verification once all required types are uploaded.
            </div>
            <Button>Submit for verification</Button>
          </div>
        </section>
      </div>
    </>
  );
}
