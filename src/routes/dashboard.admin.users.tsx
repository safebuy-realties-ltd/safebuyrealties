import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
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

export const Route = createFileRoute("/dashboard/admin/users")({
  component: () => (
    <DashboardLayout role="admin">
      <AdminUsers />
    </DashboardLayout>
  ),
});

type Role = "buyer" | "seller" | "professional" | "staff" | "admin";
type Status = "active" | "suspended" | "pending";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: Status;
  joined: string;
};

const seedUsers: ManagedUser[] = [
  { id: "u1", name: "Adaeze Okeke", email: "adaeze@example.com", role: "buyer", status: "active", joined: "Jan 12, 2026" },
  { id: "u2", name: "Tunde Kalu", email: "tunde@example.com", role: "seller", status: "active", joined: "Feb 04, 2026" },
  { id: "u3", name: "Maya Idris", email: "maya@example.com", role: "professional", status: "active", joined: "Feb 18, 2026" },
  { id: "u4", name: "Olu Adebayo", email: "olu@example.com", role: "buyer", status: "pending", joined: "Mar 02, 2026" },
  { id: "u5", name: "Femi Bello", email: "femi@example.com", role: "professional", status: "active", joined: "Mar 09, 2026" },
  { id: "u6", name: "Chika Eze", email: "chika@example.com", role: "staff", status: "active", joined: "Mar 14, 2026" },
  { id: "u7", name: "Ngozi A.", email: "ngozi@example.com", role: "buyer", status: "suspended", joined: "Mar 21, 2026" },
  { id: "u8", name: "Ifeanyi U.", email: "ifeanyi@example.com", role: "seller", status: "active", joined: "Mar 28, 2026" },
  { id: "u9", name: "Tobi Lawal", email: "tobi@example.com", role: "professional", status: "active", joined: "Apr 02, 2026" },
  { id: "u10", name: "Zainab Musa", email: "zainab@example.com", role: "buyer", status: "active", joined: "Apr 06, 2026" },
  { id: "u11", name: "Kemi Ade", email: "kemi@example.com", role: "seller", status: "pending", joined: "Apr 11, 2026" },
  { id: "u12", name: "Sade O.", email: "sade@example.com", role: "buyer", status: "active", joined: "Apr 15, 2026" },
  { id: "u13", name: "David Eke", email: "david@example.com", role: "staff", status: "active", joined: "Apr 18, 2026" },
  { id: "u14", name: "Bola A.", email: "bola@example.com", role: "buyer", status: "suspended", joined: "Apr 22, 2026" },
  { id: "u15", name: "Halima I.", email: "halima@example.com", role: "professional", status: "active", joined: "Apr 27, 2026" },
];

const statusMeta: Record<Status, string> = {
  active: "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]",
  suspended: "border-destructive/30 bg-destructive/10 text-destructive",
  pending: "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]",
};

const PAGE_SIZE = 8;

function initialsOf(n: string) {
  return n.split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
}

function AdminUsers() {
  const [users, setUsers] = useState<ManagedUser[]>(seedUsers);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (q && !`${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [users, q, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const updateRole = (id: string, role: Role) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    toast.success("Role updated");
  };
  const updateStatus = (id: string, status: Status) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)));
    toast.success(`User ${status}`);
  };

  return (
    <>
      <PageHeader
        title="User management"
        description="Search, filter and manage roles and account status."
        actions={<Button>Invite user</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={String(users.length)} />
        <StatCard label="Active" value={String(users.filter((u) => u.status === "active").length)} />
        <StatCard label="Pending" value={String(users.filter((u) => u.status === "pending").length)} />
        <StatCard label="Suspended" value={String(users.filter((u) => u.status === "suspended").length)} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name or email…" className="h-10 pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v as Role | "all"); setPage(1); }}>
          <SelectTrigger className="h-10 w-[160px]"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="buyer">Buyer</SelectItem>
            <SelectItem value="seller">Seller</SelectItem>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as Status | "all"); setPage(1); }}>
          <SelectTrigger className="h-10 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-12 gap-4 border-b border-border/60 bg-secondary/40 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div className="col-span-4">User</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Joined</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <ul className="divide-y divide-border/60">
          {visible.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">No users match.</li>
          )}
          {visible.map((u) => (
            <li key={u.id} className="grid grid-cols-1 gap-3 px-5 py-4 text-sm md:grid-cols-12 md:items-center md:gap-4">
              <div className="col-span-4 flex items-center gap-3 min-w-0">
                <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary-soft text-primary text-xs">{initialsOf(u.name)}</AvatarFallback></Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div className="col-span-2">
                <Select value={u.role} onValueChange={(v) => updateRole(u.id, v as Role)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Badge variant="outline" className={statusMeta[u.status]}>
                  {u.status}
                </Badge>
              </div>
              <div className="col-span-2 text-muted-foreground">{u.joined}</div>
              <div className="col-span-2 flex justify-end gap-2">
                {u.status !== "active" ? (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(u.id, "active")}>Activate</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(u.id, "suspended")}>Suspend</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
          <span>
            Showing {visible.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{(safePage - 1) * PAGE_SIZE + visible.length} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>Page {safePage} of {totalPages}</span>
            <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
