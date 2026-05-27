import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateInspectionMutation } from "@/hooks/use-inspections";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

export function ScheduleInspectionDialog({
  listingId,
  open,
  onOpenChange,
}: {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const create = useCreateInspectionMutation();

  if (!open) return null;

  const submit = () => {
    if (!scheduledAt) {
      toast.error("Please choose a date and time");
      return;
    }
    const iso = new Date(scheduledAt).toISOString();
    create.mutate(
      { listingId, scheduledAt: iso, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Inspection request submitted");
          onOpenChange(false);
          setScheduledAt("");
          setNotes("");
        },
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : "Could not schedule inspection"),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-lg"
        role="dialog"
        aria-labelledby="inspection-title"
      >
        <h2 id="inspection-title" className="text-lg font-semibold">
          Schedule inspection
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Request a property visit. Staff will confirm your slot.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="inspection-when">Preferred date & time</Label>
            <Input
              id="inspection-when"
              type="datetime-local"
              className="mt-1"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inspection-notes">Notes (optional)</Label>
            <Textarea
              id="inspection-notes"
              className="mt-1"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </div>
    </div>
  );
}
