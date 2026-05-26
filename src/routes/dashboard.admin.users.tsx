import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAdminUsersQuery, usePatchUserMutation } from "@/hooks/use-admin-users";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/admin/users")({
  component: AdminUsers,
});

type RoleUi = "buyer" | "seller" | "professional" | "staff" | "admin";

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

function toApiRole(r: RoleUi): string {
  return r.toUpperCase();
}

function AdminUsers() {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleUi | "all">("all");
  const [page, setPage] = useState(1);
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

  const updateRole = (id: string, role: RoleUi) => {
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

  return (
    <>
      <PageHeader title="User management" description="Search and update roles (API-backed)." />

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
        <StatCard label="Filter" value={roleFilter === "all" ? "All roles" : roleFilter} />
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
            setRoleFilter(v as RoleUi | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 w-[160px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="buyer">Buyer</SelectItem>
            <SelectItem value="seller">Seller</SelectItem>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
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
            filteredLocal.map((u) => (
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
                <div className="col-span-3">
                  <Badge variant="outline">{u.role}</Badge>
                </div>
                <div className="col-span-3 text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()}
                </div>
                <div className="col-span-2 flex justify-end">
                  <Select
                    value={u.role as RoleUi}
                    onValueChange={(v) => updateRole(u.id, v as RoleUi)}
                    disabled={patch.isPending}
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer</SelectItem>
                      <SelectItem value="seller">Seller</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </li>
            ))}
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
    </>
  );
}
