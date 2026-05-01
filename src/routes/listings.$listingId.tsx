import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { sampleListings } from "@/components/ListingCard";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, MapPin, BedDouble, Bath, Maximize, FileText, CheckCircle2, Circle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/listings/$listingId")({
  loader: ({ params }) => {
    const listing = sampleListings.find((l) => l.id === params.listingId);
    if (!listing) throw notFound();
    return { listing };
  },
  component: ListingDetail,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Listing not found</h1>
        <Button asChild className="mt-4"><Link to="/">Go home</Link></Button>
      </div>
    </div>
  ),
});

const steps = [
  { label: "Submission received", done: true },
  { label: "Document review", done: true },
  { label: "Field verification", done: true, current: false },
  { label: "Legal validation", done: false, current: true },
  { label: "Final approval", done: false },
];

function ListingDetail() {
  const { listing } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-card)]">
          <img src={listing.image} alt={listing.title} className="aspect-[21/9] w-full object-cover" />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{listing.location}</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">{listing.title}</h1>
              </div>
              {listing.verified && (
                <Badge className="gap-1 bg-primary-soft text-primary border-primary/20"><ShieldCheck className="h-3.5 w-3.5" /> Verified</Badge>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-6 border-y border-border/60 py-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><BedDouble className="h-4 w-4" /> {listing.beds} beds</span>
              <span className="flex items-center gap-1.5"><Bath className="h-4 w-4" /> {listing.baths} baths</span>
              <span className="flex items-center gap-1.5"><Maximize className="h-4 w-4" /> {listing.area}</span>
            </div>

            <section className="mt-8">
              <h2 className="text-lg font-semibold">About this property</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                A meticulously maintained residence in {listing.location}, this property has passed our complete verification process —
                including title, survey, structural and legal reviews. All documents are available for inspection by verified buyers.
              </p>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold">Documents</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {["Title deed", "Survey plan", "Structural report", "Tax clearance"].map((d) => (
                  <div key={d} className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><FileText className="h-4 w-4" /></span>
                      <div>
                        <p className="text-sm font-medium">{d}</p>
                        <p className="text-xs text-muted-foreground">PDF · Verified</p>
                      </div>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Asking price</p>
              <p className="mt-2 text-3xl font-semibold text-primary">{listing.price}</p>
              <Button className="mt-5 w-full" size="lg">Make an offer</Button>
              <Button variant="outline" className="mt-2 w-full">Schedule visit</Button>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
              <h3 className="font-semibold">Verification progress</h3>
              <ol className="mt-5 space-y-4">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5">
                      {s.done ? <CheckCircle2 className="h-5 w-5 text-primary" /> :
                        s.current ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> :
                        <Circle className="h-5 w-5 text-muted-foreground/40" />}
                    </span>
                    <div>
                      <p className={`text-sm font-medium ${s.done || s.current ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.done ? "Completed" : s.current ? "In progress" : "Pending"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
