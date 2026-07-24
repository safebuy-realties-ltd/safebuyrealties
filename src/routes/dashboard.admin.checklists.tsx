import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import {
  useAdminDdChecklistsQuery,
  useCreateDdItemMutation,
  useCreateDdScheduleMutation,
  useReorderDdItemsMutation,
  useUpdateDdItemMutation,
  useUpdateDdScheduleMutation,
  type DdChecklistItemDto,
  type DdScheduleDto,
} from "@/hooks/use-dd-checklists";

export const Route = createFileRoute("/dashboard/admin/checklists")({
  component: AdminChecklistsPage,
});

function ScheduleEditor({ schedule }: { schedule: DdScheduleDto }) {
  const updateSchedule = useUpdateDdScheduleMutation();
  const createItem = useCreateDdItemMutation();
  const updateItem = useUpdateDdItemMutation();
  const reorder = useReorderDdItemsMutation();

  const [shortName, setShortName] = useState(schedule.shortName);
  const [description, setDescription] = useState(schedule.description);
  const [active, setActive] = useState(schedule.active);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");

  useEffect(() => {
    setShortName(schedule.shortName);
    setDescription(schedule.description);
    setActive(schedule.active);
  }, [schedule]);

  const items = useMemo(
    () => [...schedule.items].sort((a, b) => a.sortOrder - b.sortOrder),
    [schedule.items],
  );

  const saveSchedule = () => {
    updateSchedule.mutate(
      {
        id: schedule.id,
        body: { shortName: shortName.trim(), description: description.trim(), active },
      },
      {
        onSuccess: () => toast.success("Schedule saved."),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Save failed."),
      },
    );
  };

  const saveItem = (item: DdChecklistItemDto, patch: { label?: string; active?: boolean }) => {
    updateItem.mutate(
      { itemId: item.id, body: patch },
      {
        onSuccess: () => toast.success("Item updated."),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Update failed."),
      },
    );
  };

  const addItem = () => {
    if (!newCode.trim() || !newLabel.trim()) {
      toast.error("Code and label are required.");
      return;
    }
    createItem.mutate(
      {
        scheduleId: schedule.id,
        body: {
          code: newCode.trim().toUpperCase(),
          label: newLabel.trim(),
          description: newDesc.trim() || undefined,
          sortOrder: items.length,
        },
      },
      {
        onSuccess: () => {
          toast.success("Item added.");
          setNewCode("");
          setNewLabel("");
          setNewDesc("");
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Add failed."),
      },
    );
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const ordered = items.map((i) => i.id);
    const [removed] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, removed);
    reorder.mutate(
      { scheduleId: schedule.id, orderedIds: ordered },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Reorder failed."),
      },
    );
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Schedule {schedule.letter} · {schedule.code}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{schedule.name}</h2>
          {!schedule.active && (
            <Badge variant="secondary" className="mt-2">
              Inactive
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`active-${schedule.id}`} className="text-sm text-muted-foreground">
            Active
          </Label>
          <Switch
            id={`active-${schedule.id}`}
            checked={active}
            onCheckedChange={setActive}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`short-${schedule.id}`}>Short name</Label>
          <Input
            id={`short-${schedule.id}`}
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`desc-${schedule.id}`}>Description</Label>
          <Textarea
            id={`desc-${schedule.id}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="mt-4">
        <Button size="sm" onClick={saveSchedule} disabled={updateSchedule.isPending}>
          {updateSchedule.isPending ? "Saving…" : "Save schedule"}
        </Button>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-foreground">Checklist items</h3>
        <ul className="mt-3 divide-y divide-border/60 rounded-lg border border-border/60">
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              onSave={saveItem}
              onMove={moveItem}
              busy={reorder.isPending || updateItem.isPending}
            />
          ))}
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No items yet.</li>
          )}
        </ul>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-border/60 p-4">
        <p className="text-sm font-medium">Add item</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Input
            placeholder="CODE_SNAKE"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <Input
            placeholder="Label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="sm:col-span-2"
          />
          <Input
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="sm:col-span-3"
          />
        </div>
        <Button size="sm" className="mt-3" onClick={addItem} disabled={createItem.isPending}>
          <Plus className="mr-1 h-4 w-4" />
          Add item
        </Button>
      </div>
    </section>
  );
}

function ItemRow({
  item,
  index,
  total,
  onSave,
  onMove,
  busy,
}: {
  item: DdChecklistItemDto;
  index: number;
  total: number;
  onSave: (item: DdChecklistItemDto, patch: { label?: string; active?: boolean }) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  busy: boolean;
}) {
  const [label, setLabel] = useState(item.label);
  const [active, setActive] = useState(item.active);

  useEffect(() => {
    setLabel(item.label);
    setActive(item.active);
  }, [item]);

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          disabled={busy || index === 0}
          onClick={() => onMove(index, -1)}
          aria-label="Move up"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          disabled={busy || index >= total - 1}
          onClick={() => onMove(index, 1)}
          aria-label="Move down"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-mono text-xs text-muted-foreground">{item.code}</p>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={active} onCheckedChange={setActive} />
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onSave(item, { label: label.trim(), active })}
        >
          Save
        </Button>
      </div>
    </li>
  );
}

function CreateScheduleDialog() {
  const create = useCreateDdScheduleMutation();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [letter, setLetter] = useState("E");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setCode("");
    setLetter("E");
    setName("");
    setShortName("");
    setDescription("");
  };

  const submit = () => {
    if (!code.trim() || !name.trim() || !shortName.trim() || !description.trim()) {
      toast.error("All fields are required.");
      return;
    }
    create.mutate(
      {
        code: code.trim().toUpperCase(),
        letter: letter.trim().toUpperCase(),
        name: name.trim(),
        shortName: shortName.trim(),
        description: description.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Schedule created.");
          reset();
          setOpen(false);
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Create failed."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          New schedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create schedule</DialogTitle>
          <DialogDescription>Add a new due diligence schedule with a unique code.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CUSTOM_CHECK" />
            </div>
            <div className="space-y-2">
              <Label>Letter</Label>
              <Input value={letter} onChange={(e) => setLetter(e.target.value)} maxLength={2} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Short name</Label>
            <Input value={shortName} onChange={(e) => setShortName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminChecklistsPage() {
  const { data: schedules, isLoading, isError, error, refetch } = useAdminDdChecklistsQuery();

  return (
    <>
      <PageHeader
        title="DD checklists"
        description="Customize due diligence schedules and checklist items shown in the request wizard."
        actions={<CreateScheduleDialog />}
      />

      {isError && (
        <p className="mb-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load checklists."}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading schedules…</p>}

      {!isLoading && schedules && (
        <div className="space-y-6">
          {schedules.map((schedule) => (
            <ScheduleEditor key={schedule.id} schedule={schedule} />
          ))}
        </div>
      )}
    </>
  );
}
