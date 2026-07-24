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
import {
  usePendingCredentialsQuery,
  useVerifyCredentialMutation,
} from "@/hooks/use-professional-profile";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/admin/credentials")({
  component: StaffCredentials,
});

function StaffCredentials() {
  const { data: pending, isLoading, isError, error, refetch } = usePendingCredentialsQuery();
  const verify = useVerifyCredentialMutation();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const rows = pending ?? [];

  const handleApprove = async (id: string) => {
    try {
      await verify.mutateAsync({ id, approve: true });
      toast.success("Credential approved.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not approve credential.");
    }
  };

  const handleReject = async (id: string) => {
    if (!note.trim()) {
      toast.error("A rejection note is required.");
      return;
    }
    try {
      await verify.mutateAsync({ id, approve: false, rejectionNote: note.trim() });
      toast.success("Credential rejected.");
      setRejectingId(null);
      setNote("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reject credential.");
    }
  };

  return (
    <>
      <PageHeader
        title="Credential Reviews"
        description="Review and verify professional licensing credentials."
      />

      {isError && (
        <p className="mb-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load pending credentials."}{" "}
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
              <TableHead>Type</TableHead>
              <TableHead>Regulatory body</TableHead>
              <TableHead>License number</TableHead>
              <TableHead>Documents</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No pending credentials to review.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <Fragment key={row.id}>
                <TableRow>
                  <TableCell className="font-medium">
                    {row.user.firstName} {row.user.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.user.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.user.professionalType ?? "—"}
                  </TableCell>
                  <TableCell>{row.regulatoryBody}</TableCell>
                  <TableCell>{row.licenseNumber}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {row.licenseDocumentUrl ? (
                        <a
                          href={row.licenseDocumentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary underline"
                        >
                          License
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">No license</span>
                      )}
                      {row.idDocumentUrl ? (
                        <a
                          href={row.idDocumentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary underline"
                        >
                          ID
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">No ID</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleApprove(row.id)}
                        disabled={verify.isPending}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectingId(rejectingId === row.id ? null : row.id);
                          setNote("");
                        }}
                        disabled={verify.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {rejectingId === row.id && (
                  <TableRow>
                    <TableCell colSpan={7}>
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
                            onClick={() => void handleReject(row.id)}
                            disabled={verify.isPending}
                          >
                            Confirm rejection
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRejectingId(null);
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
