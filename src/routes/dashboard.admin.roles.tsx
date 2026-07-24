import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  ALL_PERMISSION_CODES,
  PERMISSION_LABELS,
  PERMISSION_NAV_UNLOCKS,
  canManageAdminRoles,
  type PermissionCode,
} from "@/lib/permissions";
import {
  useAdminRolesQuery,
  useCreateAdminRoleMutation,
  useDeleteAdminRoleMutation,
  usePrivilegeCatalogQuery,
  useUpdateAdminRoleMutation,
  type AdminRoleDto,
} from "@/hooks/use-admin-roles";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin/roles")({
  component: AdminRolesPage,
});

function PrivilegeChecklist({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const catalog = usePrivilegeCatalogQuery();
  const items = catalog.data?.length
    ? catalog.data
    : ALL_PERMISSION_CODES.map((code) => ({
        code,
        label: PERMISSION_LABELS[code],
        unlocks: PERMISSION_NAV_UNLOCKS[code],
      }));

  const toggle = (code: string, checked: boolean) => {
    if (checked) onChange([...new Set([...selected, code])]);
    else onChange(selected.filter((c) => c !== code));
  };

  return (
    <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
      {items.map((item) => {
        const code = item.code as PermissionCode;
        const checked = selected.includes(code);
        return (
          <label key={code} className="flex cursor-pointer gap-3 text-sm">
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(v) => toggle(code, v === true)}
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-foreground">
                {item.label || PERMISSION_LABELS[code] || code}
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                {code}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Unlocks: {(item.unlocks ?? PERMISSION_NAV_UNLOCKS[code] ?? []).join(", ")}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function CreateRoleDialog() {
  const createRole = useCreateAdminRoleMutation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);

  const submit = async () => {
    try {
      await createRole.mutateAsync({ name, description, permissions });
      toast.success("Role created");
      setOpen(false);
      setName("");
      setDescription("");
      setPermissions([]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create role");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1.5 h-4 w-4" />
          New role
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create admin role</DialogTitle>
          <DialogDescription>
            Define a named role and select which privileges it unlocks in the admin portal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Regional Ops Lead"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-desc">Description</Label>
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is responsible for"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Privileges</Label>
            <PrivilegeChecklist selected={permissions} onChange={setPermissions} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || createRole.isPending} onClick={() => void submit()}>
            {createRole.isPending ? "Saving…" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRoleDialog({ role }: { role: AdminRoleDto }) {
  const updateRole = useUpdateAdminRoleMutation();
  const deleteRole = useDeleteAdminRoleMutation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(role.permissions);

  const submit = async () => {
    try {
      await updateRole.mutateAsync({
        id: role.id,
        body: { name, description, permissions },
      });
      toast.success("Role updated");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update role");
    }
  };

  const remove = async () => {
    try {
      await deleteRole.mutateAsync(role.id);
      toast.success("Role deleted");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete role");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit role — {role.name}</DialogTitle>
          <DialogDescription>
            {role.isSystem
              ? "System role. Privilege edits are limited to super administrators."
              : "Update the privilege checklist for this role."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={role.isSystem}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <PrivilegeChecklist selected={permissions} onChange={setPermissions} />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {!role.isSystem ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteRole.isPending}
              onClick={() => void remove()}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={updateRole.isPending} onClick={() => void submit()}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminRolesPage() {
  const { user } = useAuth();
  const rolesQuery = useAdminRolesQuery();
  const allowed = canManageAdminRoles(user?.role, user?.permissions);

  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);

  if (!allowed) {
    return (
      <div>
        <PageHeader
          title="Roles & Privileges"
          description="You do not have permission to manage admin roles."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Roles & Privileges"
        description="Named roles for company operators. Each privilege unlocks specific sections of this admin portal."
        actions={<CreateRoleDialog />}
      />

      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Privilege catalog</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Checklist of every privilege and the dashboard areas it unlocks.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_PERMISSION_CODES.map((code) => (
            <div key={code} className="rounded-lg border border-border/80 bg-secondary/20 p-3">
              <p className="text-sm font-medium text-foreground">{PERMISSION_LABELS[code]}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{code}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {PERMISSION_NAV_UNLOCKS[code].join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {rolesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading roles…</p>
        ) : roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No roles yet.</p>
        ) : (
          roles.map((role) => (
            <div
              key={role.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-foreground">{role.name}</h3>
                  {role.isSystem ? <Badge variant="secondary">System</Badge> : null}
                  {typeof role.userCount === "number" ? (
                    <Badge variant="outline">{role.userCount} users</Badge>
                  ) : null}
                </div>
                {role.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {role.permissions.map((p) => (
                    <Badge key={p} variant="outline" className="font-mono text-[10px]">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
              <EditRoleDialog role={role} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
