import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/admin/listings")({
  component: () => (
    <DashboardLayout role="admin">
      <AdminListings />
    </DashboardLayout>
  ),
});

type Verification = "unverified" | "in_review" | "verified" | "rejected";

type AdminListing = {
  id: string;
  title: string;
  seller: string;
  location: string;
  price: string;
  state: Verification;
  submitted: string;
};

const seed: AdminListing[] = [
  { id: "1", title: "Garden Court Residence", seller: "Tunde K.", location: "Lekki, Lagos", price: "$420,000", state: "verified", submitted: "Apr 02" },
  { id: "2", title: "Maple Heights Apartment", seller: "Adaeze O.", location: "Abuja Central", price: "$185,000", state: "verified", submitted: "Apr 04" },
  { id: "3", title: "Cedar Park Villa", seller: "Ifeanyi U.", location: "Ikoyi, Lagos", price: "$760,000", state: "in_review", submitted: "Apr 09" },
  { id: "4", title: "Riverside Townhouse", seller: "Maya I.", location: "Port Harcourt", price: "$295,000", state: "in_review", submitted: "Apr 12" },
  { id: "5", title: "Sunset Bay Condo", seller: "Olu A.", location: "Victoria Island", price: "$510,000", state: "unverified", submitted: "Apr 18" },
  { id: "6", title: "Acacia Hills Estate", seller: "Ngozi A.", location: "Ibadan", price: "$210,000", state: "rejected", submitted: "Apr 21" },
  { id: "7", title: "Palm Grove Duplex", seller: "Femi B.", location: "Ajah, Lagos", price: "$345,000", state: "in_review", submitted: "Apr 24" },
  { id: "8", title: "Harmony Gardens", seller: "Kemi A.", location: "Enugu", price: "$152,000", state: "unverified", submitted: "Apr 28" },
];

const stateMeta: Record<Verification, { label: string; className: string }> = {
  unverified: { label: "Unverified", className: "border-border bg-secondary text-muted-foreground" },
  in_review: { label: "In review", className: "border-primary/20 bg-primary-soft text-primary" },
  verified: { label: "Verified", className: "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]" },
  rejected: { label: "Rejected", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

const filters: { id: Verification | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unverified", label: "Unverified" },
  { id: "in_review", label: "In review" },
  { id: "verified", label: "Verified" },
  { id: "rejected", label: "Rejected" },
];

function AdminListings() {
  const [items, setItems] = useState<AdminListing[]>(seed);
  const [filter, setFilter] = useState<Verification | "all">("all");
  const [q, setQ] = useState("");

  const visible = useMemo(
    () =>
      items.filter((l) => {
        if (filter !== "all" && l.state !== filter) return false;
        if (q && !`${l.title} ${l.seller} ${l.location}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [items, filter, q],
  );

  const counts = {
    all: items.length,
    unverified: items.filter((l) => l.state === "unverified").length,
    in_review: items.filter((l) => l.state === "in_review").length,
    verified: items.filter((l) => l.state === "verified").length,
    rejected: items.filter((l) => l.state === "rejected").length,
  };

  const update = (id: string, state: Verification) => {
    setItems((prev) => prev.map((l) => (l.id === id ? { ...l, state } : l)));
    toast.success(`Listing marked as ${stateMeta[state].label.toLowerCase()}`);
  };

  return (
    <>
      <PageHeader
        title="Listings overview"
        description="Filter by verification state and update statuses in one click."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Verified" value={String(counts.verified)} />
        <StatCard label="In review" value={String(counts.in_review)} />
        <StatCard label="Unverified" value={String(counts.unverified)} />
        <StatCard label="Rejected" value={String(counts.rejected)} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-border/60 bg-card p-1 shadow-sm">
          {filters.map((f) => {
            const active = filter === f.id;
            const c = f.id === "all" ? counts.all : counts[f.id];
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-[10px] font-semibold ${active ? "bg-primary-foreground/20" : "bg-secondary"}`}>{c}</span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search listings…" className="h-10 pl-9" />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-12 gap-4 border-b border-border/60 bg-secondary/40 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div className="col-span-3">Listing</div>
          <div className="col-span-2">Seller</div>
          <div className="col-span-2">Location</div>
          <div className="col-span-1">Price</div>
          <div className="col-span-2">State</div>
          <div className="col-span-2 text-right">Quick update</div>
        </div>
        <ul className="divide-y divide-border/60">
          {visible.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">No listings match.</li>
          )}
          {visible.map((l) => (
            <li key={l.id} className="grid grid-cols-1 gap-2 px-5 py-4 text-sm md:grid-cols-12 md:items-center md:gap-4">
              <div className="col-span-3 font-medium text-foreground">{l.title}</div>
              <div className="col-span-2 text-muted-foreground">{l.seller}</div>
              <div className="col-span-2 text-muted-foreground">{l.location}</div>
              <div className="col-span-1 text-foreground">{l.price}</div>
              <div className="col-span-2">
                <Badge variant="outline" className={stateMeta[l.state].className}>{stateMeta[l.state].label}</Badge>
              </div>
              <div className="col-span-2 flex flex-wrap justify-end gap-1.5">
                {l.state !== "in_review" && (
                  <Button size="sm" variant="outline" onClick={() => update(l.id, "in_review")}>Review</Button>
                )}
                {l.state !== "verified" && (
                  <Button size="sm" onClick={() => update(l.id, "verified")}>Verify</Button>
                )}
                {l.state !== "rejected" && (
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => update(l.id, "rejected")}>Reject</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
