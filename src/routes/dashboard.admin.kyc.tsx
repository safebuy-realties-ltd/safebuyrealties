import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useKycQueueQuery, useRejectKycMutation, useVerifyKycMutation } from "@/hooks/use-kyc";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/admin/kyc")({
  component: StaffKycReviews,
});

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function StaffKycReviews() {
  const { data: queue, isLoading, isError, error, refetch } = useKycQueueQuery();
  const verify = useVerifyKycMutation();
  const reject = useRejectKycMutation();
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const rows = queue ?? [];

  const handleVerify = async (userId: string) => {
    try {
      await verify.mutateAsync(userId);
      toast.success("KYC verified.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not verify KYC.");
    }
  };

  const handleReject = async (userId: string) => {
    if (!note.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    try {
      await reject.mutateAsync({ userId, note: note.trim() });
      toast.success("KYC rejected.");
      setRejectingUserId(null);
      setNote("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reject KYC.");
    }
  };

  return (
    <>
      <PageHeader
        title="KYC Reviews"
        description="Review buyer identity documents and approve or reject submissions."
      />

      {isError && (
        <p className="mb-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load KYC queue."}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      )}

      <div className="rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Documents</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  No KYC submissions awaiting review.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <Fragment key={row.userId}>
                <TableRow>
                  <TableCell className="font-medium">
                    {row.user.firstName} {row.user.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.user.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.submittedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {row.documents.map((doc, index) => (
                        <a
                          key={doc.storageKey}
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary underline"
                        >
                          Document {index + 1}
                        </a>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleVerify(row.userId)}
                        disabled={verify.isPending || reject.isPending}
                      >
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectingUserId(rejectingUserId === row.userId ? null : row.userId);
                          setNote("");
                        }}
                        disabled={verify.isPending || reject.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {rejectingUserId === row.userId && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="space-y-2">
                        <Textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Reason for rejection (required)…"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void handleReject(row.userId)}
                            disabled={reject.isPending}
                          >
                            Confirm rejection
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRejectingUserId(null);
                              setNote("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
