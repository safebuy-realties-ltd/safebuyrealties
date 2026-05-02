import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminUsersQuery } from "@/hooks/use-admin-users";
import { useListingsQuery } from "@/hooks/use-listings";

export const Route = createFileRoute("/dashboard/admin")({
  component: () => (
    <DashboardLayout role="admin">
      <AdminOverview />
    </DashboardLayout>
  ),
});

function initialsOf(n: string) {
  return n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

function AdminOverview() {
  const { data: usersData, isLoading: loadUsers, isError: usersErr } = useAdminUsersQuery({ page: 1, pageSize: 8 });
  const { data: listingsData, isLoading: loadListings, isError: listingsErr } = useListingsQuery({ pageSize: 200 });
  const users = usersData?.users ?? [];
  const totalUsers = usersData?.meta?.total ?? 0;
  const listings = listingsData?.listings ?? [];

  const pendingReviews = useMemo(
    () => listings.filter((l) => l.status === "PENDING_REVIEW").length,
    [listings],
  );

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Counts from the database. Open Users or Listings for full views."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/admin/users">Users</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/dashboard/admin/listings">Listings</Link>
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Users (total)" value={loadUsers ? "…" : String(totalUsers)} hint="Registered" />
        <StatCard label="Listings loaded" value={loadListings ? "…" : String(listings.length)} hint="This page batch" />
        <StatCard label="Pending review" value={loadListings ? "…" : String(pendingReviews)} />
        <StatCard label="API" value={usersErr || listingsErr ? "Error" : "OK"} hint="Latest fetch" />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent users</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard/admin/users">Manage</Link>
            </Button>
          </div>
          {loadUsers && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
          {!loadUsers && users.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">No users returned.</p>
          )}
          <div className="mt-4 space-y-3">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary-soft text-xs text-primary">
                    {initialsOf(u.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <Badge variant="outline">{u.role}</Badge>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-semibold">Quick links</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Payments and revenue rollups are not aggregated in this MVP; use buyer transactions and seeded payments in
            the database for demos.
          </p>
          <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>
              <Link className="text-primary underline" to="/dashboard/admin/listings">
                Moderate listing statuses
              </Link>
            </li>
            <li>Staff verification: log in as staff@safebuyrealties.test to use the workflow screens.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
