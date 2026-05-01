import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout, PageHeader } from "@/components/dashboard/DashboardLayout";
import { sampleListings } from "@/components/ListingCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ShieldCheck, ShieldAlert, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/buyer/listings")({
  component: () => (
    <DashboardLayout role="buyer">
      <BrowseListings />
    </DashboardLayout>
  ),
});

type Verification = "verified" | "in_review" | "unverified";

type Row = {
  id: string;
  title: string;
  location: string;
  price: string;
  priceValue: number;
  beds: number;
  baths: number;
  area: string;
  verification: Verification;
};

const verifLabels: Record<Verification, string> = {
  verified: "Verified",
  in_review: "In review",
  unverified: "Unverified",
};

const verifStyles: Record<Verification, string> = {
  verified: "border-success/30 bg-success/15 text-[oklch(0.4_0.12_155)]",
  in_review: "border-primary/20 bg-primary-soft text-primary",
  unverified: "border-warning/30 bg-warning/15 text-[oklch(0.45_0.13_75)]",
};

const verifIcons: Record<Verification, typeof ShieldCheck> = {
  verified: ShieldCheck,
  in_review: Clock,
  unverified: ShieldAlert,
};

const data: Row[] = sampleListings.map((l, i) => ({
  id: l.id,
  title: l.title,
  location: l.location,
  price: l.price,
  priceValue: Number(l.price.replace(/[^0-9]/g, "")) || 0,
  beds: l.beds,
  baths: l.baths,
  area: l.area,
  verification: l.verified ? "verified" : i % 2 === 0 ? "in_review" : "unverified",
}));

type SortKey = "title" | "location" | "priceValue" | "beds" | "verification";
type SortDir = "asc" | "desc";

function BrowseListings() {
  const [q, setQ] = useState("");
  const [verif, setVerif] = useState<Verification | "all">("all");
  const [beds, setBeds] = useState<string>("any");
  const [sortKey, setSortKey] = useState<SortKey>("priceValue");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const rows = useMemo(() => {
    const filtered = data.filter((r) => {
      if (verif !== "all" && r.verification !== verif) return false;
      if (beds !== "any" && r.beds < Number(beds)) return false;
      if (q && !(`${r.title} ${r.location}`.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [q, verif, beds, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => {
    const Icon = sortKey !== k ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground ${className}`}
      >
        {children}
        <Icon className="h-3 w-3" />
      </button>
    );
  };

  return (
    <>
      <PageHeader
        title="Browse listings"
        description="Search verified properties and review verification status."
      />

      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title or location…"
              className="h-10 pl-9"
            />
          </div>
          <select
            value={verif}
            onChange={(e) => setVerif(e.target.value as Verification | "all")}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All verification</option>
            <option value="verified">Verified</option>
            <option value="in_review">In review</option>
            <option value="unverified">Unverified</option>
          </select>
          <select
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="any">Any beds</option>
            <option value="2">2+ beds</option>
            <option value="3">3+ beds</option>
            <option value="4">4+ beds</option>
          </select>
          <Button
            variant="outline"
            onClick={() => { setQ(""); setVerif("all"); setBeds("any"); }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-12 gap-4 border-b border-border/60 bg-secondary/40 px-5 py-3 md:grid">
          <div className="col-span-4"><SortHeader k="title">Property</SortHeader></div>
          <div className="col-span-3"><SortHeader k="location">Location</SortHeader></div>
          <div className="col-span-2 text-right"><SortHeader k="priceValue" className="ml-auto">Price</SortHeader></div>
          <div className="col-span-1 text-right"><SortHeader k="beds" className="ml-auto">Beds</SortHeader></div>
          <div className="col-span-2"><SortHeader k="verification">Verification</SortHeader></div>
        </div>
        <div className="divide-y divide-border/60">
          {rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No listings match your filters.</div>
          )}
          {rows.map((r) => {
            const Icon = verifIcons[r.verification];
            return (
              <Link
                key={r.id}
                to="/listings/$listingId"
                params={{ listingId: r.id }}
                className="grid grid-cols-1 gap-2 px-5 py-4 text-sm transition-colors hover:bg-secondary/40 md:grid-cols-12 md:items-center md:gap-4"
              >
                <div className="col-span-4">
                  <p className="font-medium text-foreground">{r.title}</p>
                  <p className="text-xs text-muted-foreground md:hidden">{r.location}</p>
                </div>
                <div className="col-span-3 hidden text-muted-foreground md:block">{r.location}</div>
                <div className="col-span-2 font-semibold text-primary md:text-right">{r.price}</div>
                <div className="col-span-1 text-muted-foreground md:text-right">{r.beds}</div>
                <div className="col-span-2">
                  <Badge variant="outline" className={`gap-1 ${verifStyles[r.verification]}`}>
                    <Icon className="h-3 w-3" /> {verifLabels[r.verification]}
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Showing {rows.length} of {data.length} listings
      </p>
    </>
  );
}
