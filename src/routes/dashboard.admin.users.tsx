import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, UserPlus, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  useAdminUsersQuery,
  useCreateUserMutation,
  usePatchUserMutation,
} from "@/hooks/use-admin-users";
import {
  usePermissionsCatalogQuery,
  useSetUserPermissionsMutation,
  useUserPermissionsQuery,
} from "@/hooks/use-admin-permissions";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  assignableRoles,
  canAssignRole,
  PROFESSIONAL_TYPES,
  type ManageableRole,
  type ProfessionalType,
} from "@/lib/role-hierarchy";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useAdminRolesQuery,
} from "@/hooks/use-admin-roles";
import {
  canManageUserPermissions,
  isInternalPortalRole,
  PERMISSION_LABELS,
  type PermissionCode,
} from "@/lib/permissions";

export const Route = createFileRoute("/dashboard/admin/users")({
  component: AdminUsers,
});

const PAGE_SIZE = 8;

function initialsOf(n: string) {
  return n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

function toApiRole(r: ManageableRole): string {
  return r.toUpperCase();
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function roleLabel(role: ManageableRole): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function CreateUserDialog() {
  const { user } = useAuth();
  const createUser = useCreateUserMutation();
  const rolesQuery = useAdminRolesQuery(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ManageableRole>("staff");
  const [professionalType, setProfessionalType] = useState<ProfessionalType>("LAWYER");
  const [adminRoleId, setAdminRoleId] = useState<string>("");

  const allowedRoles = useMemo(() => assignableRoles(user?.role), [user?.role]);
  const companyRoles = useMemo(
    () => (rolesQuery.data ?? []).filter((r) => r.name !== "Super Administrator"),
    [rolesQuery.data],
  );

  const reset = () => {
    setEmail("");
    setName("");
    setPassword("");
    setRole("staff");
    setProfessionalType("LAWYER");
    setAdminRoleId("");
  };

  const handleCreate = () => {
    const { firstName, lastName } = splitName(name);
    if (!email.trim() || !firstName || !password.trim()) {
      toast.error("Email, name, and password are required.");
      return;
    }
    if (!canAssignRole(user?.role, role)) {
      toast.error("You cannot assign that role.");
      return;
    }
    if (isInternalPortalRole(role) && !adminRoleId) {
      toast.error("Select an admin portal role (privileges) for company users.");
      return;
    }
    const body = {
      email: email.trim(),
      password,
      firstName,
      lastName,
      role: toApiRole(role),
      ...(role === "professional" ? { professionalType } : {}),
      ...(isInternalPortalRole(role) && adminRoleId ? { adminRoleId } : {}),
    };
    createUser.mutate(body, {
      onSuccess: () => {
        toast.success("User created.");
        reset();
        setOpen(false);
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Create failed."),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Create user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            Provision a new account with an initial role. Password must meet server policy.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-name">Full name</Label>
            <Input
              id="create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-password">Password</Label>
            <Input
              id="create-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as ManageableRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role === "professional" && (
            <div className="grid gap-2">
              <Label>Professional type</Label>
              <Select
                value={professionalType}
                onValueChange={(v) => setProfessionalType(v as ProfessionalType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFESSIONAL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isInternalPortalRole(role) && (
            <div className="grid gap-2">
              <Label>Admin portal role</Label>
              <Select value={adminRoleId || undefined} onValueChange={setAdminRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select privileges set" />
                </SelectTrigger>
                <SelectContent>
                  {companyRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determines which sections of the admin portal this person can access.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createUser.isPending}>
            {createUser.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({
  userId,
  userName,
  userRole,
  open,
  onOpenChange,
}: {
  userId: string;
  userName: string;
  userRole: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: catalog } = usePermissionsCatalogQuery(open);
  const { data: perms, isLoading } = useUserPermissionsQuery(userId, open);
  const setPerms = useSetUserPermissionsMutation();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (perms) setSelected(perms.grants);
  }, [perms]);

  const toggle = (code: string, checked: boolean) => {
    setSelected((prev) =>
      checked ? [...new Set([...prev, code])] : prev.filter((p) => p !== code),
    );
  };

  const save = () => {
    setPerms.mutate(
      { userId, permissions: selected },
      {
        onSuccess: () => {
          toast.success("Permissions updated.");
          onOpenChange(false);
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Save failed."),
      },
    );
  };

  const resetToRoleDefaults = () => {
    setPerms.mutate(
      { userId, permissions: [] },
      {
        onSuccess: () => {
          toast.success("Custom permissions cleared (role defaults apply).");
          onOpenChange(false);
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Reset failed."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Permissions — {userName}</DialogTitle>
          <DialogDescription>
            Role: {userRole}. Custom grants override role defaults when any are set.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && perms && (
          <>
            <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Effective permissions
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {perms.effective.map((code) => (
                  <Badge key={code} variant="secondary" className="text-[10px]">
                    {PERMISSION_LABELS[code as PermissionCode] ?? code}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2 py-2">
              {(catalog ?? []).map((entry) => (
                <label
                  key={entry.code}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/50 px-3 py-2 hover:bg-secondary/30"
                >
                  <Checkbox
                    checked={selected.includes(entry.code)}
                    onCheckedChange={(v) => toggle(entry.code, v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    <span className="font-medium">
                      {PERMISSION_LABELS[entry.code as PermissionCode] ?? entry.code}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                      {entry.code}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={resetToRoleDefaults} disabled={setPerms.isPending}>
            Use role defaults
          </Button>
          <Button onClick={save} disabled={setPerms.isPending}>
            {setPerms.isPending ? "Saving…" : "Save permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminUsers() {
  const { user: actor } = useAuth();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<ManageableRole | "all">("all");
  const [page, setPage] = useState(1);
  const [permTarget, setPermTarget] = useState<{ id: string; name: string; role: string } | null>(
    null,
  );
  const assignable = useMemo(() => assignableRoles(actor?.role), [actor?.role]);
  const canEditPermissions = canManageUserPermissions(actor?.role, actor?.permissions);

  const { data, isLoading, isError, error, refetch } = useAdminUsersQuery({
    role: roleFilter === "all" ? undefined : toApiRole(roleFilter),
    page,
    pageSize: PAGE_SIZE,
  });
  const users = useMemo(() => data?.users ?? [], [data?.users]);
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filteredLocal = useMemo(() => {
    if (!q.trim()) return users;
    const n = q.toLowerCase();
    return users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(n));
  }, [users, q]);

  const patch = usePatchUserMutation();

  const toggleActive = (id: string, isActive: boolean) => {
    if (actor?.id === id) {
      toast.error("You cannot change your own account status.");
      return;
    }
    patch.mutate(
      { id, body: { isActive } },
      {
        onSuccess: () => toast.success(isActive ? "User activated." : "User deactivated."),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Update failed."),
      },
    );
  };

  const updateRole = (id: string, role: ManageableRole) => {
    if (!canAssignRole(actor?.role, role)) {
      toast.error("You cannot assign that role.");
      return;
    }
    const body: { role: string; professionalType?: string } = { role: toApiRole(role) };
    if (role === "professional") body.professionalType = "LAWYER";
    patch.mutate(
      { id, body },
      {
        onSuccess: () => toast.success("User updated."),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Update failed."),
      },
    );
  };

  const filterRoles: (ManageableRole | "all")[] = ["all", ...assignable];

  return (
    <>
      <PageHeader
        title="User management"
        description="Search, create, and update roles (API-backed)."
        actions={<CreateUserDialog />}
      />

      {isError && (
        <p className="mb-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load users."}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Page"
          value={isLoading ? "…" : `${users.length} / ${total}`}
          hint="This page"
        />
        <StatCard label="Total (server)" value={isLoading ? "…" : String(total)} />
        <StatCard
          label="Filter"
          value={roleFilter === "all" ? "All roles" : roleLabel(roleFilter)}
        />
        <StatCard label="Search" value={q ? "On" : "Off"} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or email…"
            className="h-10 pl-9"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => {
            setRoleFilter(v as ManageableRole | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 w-[180px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            {filterRoles.map((r) => (
              <SelectItem key={r} value={r}>
                {r === "all" ? "All roles" : roleLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-12 gap-4 border-b border-border/60 bg-secondary/40 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div className="col-span-4">User</div>
          <div className="col-span-3">Role</div>
          <div className="col-span-3">Joined</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <ul className="divide-y divide-border/60">
          {isLoading && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</li>
          )}
          {!isLoading && filteredLocal.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">
              No users on this page.
            </li>
          )}
          {!isLoading &&
            filteredLocal.map((u) => {
              const userRole = u.role as ManageableRole;
              const canEdit = canAssignRole(actor?.role, userRole) || assignable.includes(userRole);
              return (
                <li
                  key={u.id}
                  className="grid grid-cols-1 gap-3 px-5 py-4 text-sm md:grid-cols-12 md:items-center md:gap-4"
                >
                  <div className="col-span-4 flex min-w-0 items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary-soft text-xs text-primary">
                        {initialsOf(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <div className="col-span-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{u.role}</Badge>
                    {u.isActive === false && (
                      <Badge variant="destructive" className="text-[10px]">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="col-span-3 text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </div>
                  <div className="col-span-2 flex flex-wrap justify-end gap-2">
                    {canEdit ? (
                      <Select
                        value={userRole}
                        onValueChange={(v) => updateRole(u.id, v as ManageableRole)}
                        disabled={patch.isPending}
                      >
                        <SelectTrigger className="h-8 w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {assignable.map((r) => (
                            <SelectItem key={r} value={r}>
                              {roleLabel(r)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">Restricted</span>
                    )}
                    {actor?.id !== u.id && userRole !== "super_admin" && canEdit && (
                      <Button
                        size="sm"
                        variant={u.isActive === false ? "default" : "outline"}
                        disabled={patch.isPending}
                        onClick={() => toggleActive(u.id, u.isActive === false)}
                      >
                        {u.isActive === false ? "Activate" : "Deactivate"}
                      </Button>
                    )}
                    {canEditPermissions &&
                      actor?.id !== u.id &&
                      (userRole === "staff" || userRole === "admin") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPermTarget({ id: u.id, name: u.name, role: u.role })
                          }
                        >
                          <Shield className="mr-1 h-3.5 w-3.5" />
                          Permissions
                        </Button>
                      )}
                  </div>
                </li>
              );
            })}
        </ul>
        <div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} users
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {permTarget && (
        <PermissionsDialog
          userId={permTarget.id}
          userName={permTarget.name}
          userRole={permTarget.role}
          open={!!permTarget}
          onOpenChange={(open) => {
            if (!open) setPermTarget(null);
          }}
        />
      )}
    </>
  );
}
