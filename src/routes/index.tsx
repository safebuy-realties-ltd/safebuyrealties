import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ShieldCheck,
  FileCheck2,
  Lock,
  BadgeCheck,
  ArrowRight,
  CheckCircle2,
  ShoppingBag,
  Home,
  Briefcase,
  ClipboardList,
  Shield,
  Crown,
  Building2,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/components/ListingCard";
import { usePublicListingsQuery } from "@/hooks/use-listings";
import { listingDtoToCard } from "@/lib/listing-card-map";

export const Route = createFileRoute("/")({
  component: Landing,
});

const personas = [
  {
    id: "buyers",
    icon: ShoppingBag,
    title: "Buyers",
    headline: "Discover verified homes with confidence",
    description:
      "Browse live listings publicly, compare title-verified properties, save favorites after sign-up, schedule inspections, and start escrow-backed due diligence — without surprise fees or opaque paperwork.",
    bullets: [
      "Public browse — no login required",
      "Independent verification milestones on every listing",
      "Escrow-secured payments through closing",
    ],
    cta: { label: "Browse properties", to: "/browse" as const },
    secondary: { label: "Create buyer account", to: "/register" as const, search: { redirect: "/browse" } },
  },
  {
    id: "sellers",
    icon: Home,
    title: "Sellers",
    headline: "List once, sell with proof",
    description:
      "Submit your property with supporting documents, track staff review and field verification, and go live only when SafeBuyRealties confirms title and survey readiness — attracting serious buyers who trust the badge.",
    bullets: [
      "Guided listing and document upload",
      "Status tracking from draft to live",
      "Qualified buyers routed through the platform",
    ],
    cta: { label: "List your property", to: "/register" as const },
  },
  {
    id: "professionals",
    icon: Briefcase,
    title: "Professionals",
    headline: "Licensed experts on verified deals",
    description:
      "Lawyers, surveyors, and inspectors receive assigned tasks on active transactions, upload credentials for staff approval, and deliver structured reports that feed directly into buyer due-diligence workflows.",
    bullets: [
      "Credential verification and task inbox",
      "Structured deliverables tied to listings",
      "Transparent milestone completion",
    ],
    cta: {
      label: "Join as a professional",
      to: "/register" as const,
      search: { role: "professional" },
    },
  },
  {
    id: "staff",
    icon: ClipboardList,
    title: "Staff",
    headline: "Operations hub for verification",
    description:
      "Route seller submissions, assign professionals, manage KYC and inspections, and keep every listing moving through the verification pipeline with clear queues and audit-friendly status.",
    bullets: [
      "Submission and workflow dashboards",
      "Inspection and credential review",
      "End-to-end listing lifecycle control",
    ],
    cta: { label: "Staff sign in", to: "/login" as const },
  },
  {
    id: "admins",
    icon: Shield,
    title: "Admins",
    headline: "Platform governance and oversight",
    description:
      "Manage users, listings, escrows, and platform settings. Admins enforce policy, resolve escalations, and maintain the trust layer that buyers and sellers rely on for every transaction.",
    bullets: [
      "User and listing administration",
      "Escrow monitoring and controls",
      "Configurable platform settings",
    ],
    cta: { label: "Admin sign in", to: "/login" as const },
  },
  {
    id: "super-admins",
    icon: Crown,
    title: "Super admins",
    headline: "Full-stack platform authority",
    description:
      "Super admins hold the highest privilege tier — cross-tenant oversight, critical configuration, and break-glass access for compliance, security incidents, and strategic platform operations.",
    bullets: [
      "Highest-privilege operational access",
      "Cross-cutting compliance and security",
      "Strategic configuration and escalation",
    ],
    cta: { label: "Secure sign in", to: "/login" as const },
  },
] as const;

function Landing() {
  const { data, isLoading, isError } = usePublicListingsQuery({ pageSize: 6 });
  const featured = useMemo(
    () => (data?.listings ?? []).map(listingDtoToCard),
    [data?.listings],
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[var(--gradient-subtle)]" />
          <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                One platform for buyers, sellers, professionals, and operations teams
              </div>
              <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
                Real estate you can <span className="text-primary">actually trust.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
                SafeBuyRealties unifies verified listings, licensed professionals, staff workflows,
                and escrow-secured payments — so every persona in the property journey works from
                the same source of truth.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg" className="shadow-[var(--shadow-elegant)]">
                  <Link to="/browse">
                    Browse properties <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/register">Get started</Link>
                </Button>
                <Button asChild variant="ghost" size="lg">
                  <Link to="/register" search={{ role: "professional" }}>
                    Apply as professional
                  </Link>
                </Button>
              </div>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Verified titles
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Escrow-secured payments
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Licensed professionals
                </span>
              </div>
            </div>

            <div className="mx-auto mt-16 max-w-5xl rounded-2xl border border-border/60 bg-background p-2 shadow-[var(--shadow-elegant)]">
              <img
                src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80"
                alt="Verified luxury home"
                className="aspect-[16/9] w-full rounded-xl object-cover"
              />
            </div>
          </div>
        </section>

        {/* Personas */}
        <section id="personas" className="border-t border-border/60 bg-secondary/40">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-primary">Built for every role</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                One platform, six distinct experiences
              </h2>
              <p className="mt-3 text-muted-foreground">
                Whether you are buying your first home, listing an estate, delivering legal
                opinions, or running verification ops — SafeBuyRealties meets you where you work.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {personas.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col rounded-2xl border border-border/60 bg-card p-7 shadow-[var(--shadow-card)]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <p.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-primary">
                    {p.title}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{p.headline}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {p.description}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {p.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link to={p.cta.to} search={"search" in p.cta ? p.cta.search : undefined}>
                        {p.cta.label}
                      </Link>
                    </Button>
                    {"secondary" in p && p.secondary && (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to={p.secondary.to}
                          search={"search" in p.secondary ? p.secondary.search : undefined}
                        >
                          {p.secondary.label}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Featured listings */}
        <section id="featured" className="border-t border-border/60 bg-background">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
              <div className="max-w-xl">
                <p className="text-sm font-medium text-primary">Live on the marketplace</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Featured verified properties
                </h2>
                <p className="mt-3 text-muted-foreground">
                  A sample of live listings you can explore right now — each backed by
                  SafeBuyRealties verification before going public.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/browse">
                  View all properties <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {isLoading && (
              <div className="mt-12 text-center text-sm text-muted-foreground">
                Loading featured listings…
              </div>
            )}
            {isError && (
              <div className="mt-12 rounded-xl border border-border/60 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                Featured listings are temporarily unavailable.{" "}
                <Link to="/browse" className="text-primary underline">
                  Browse the marketplace
                </Link>{" "}
                directly.
              </div>
            )}
            {!isLoading && !isError && featured.length > 0 && (
              <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}
            {!isLoading && !isError && featured.length === 0 && (
              <div className="mt-12 flex flex-col items-center rounded-xl border border-border/60 bg-card px-6 py-14 text-center shadow-[var(--shadow-card)]">
                <Building2 className="h-10 w-10 text-muted-foreground" />
                <p className="mt-4 text-sm font-medium text-foreground">New listings arriving soon</p>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Sellers are onboarding verified properties. Check back shortly or create an
                  account to get notified when matches appear.
                </p>
                <Button asChild className="mt-6" size="sm">
                  <Link to="/browse">Browse marketplace</Link>
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border/60 bg-secondary/40">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-primary">Why SafeBuyRealties</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Confidence built into every step
              </h2>
              <p className="mt-3 text-muted-foreground">
                A complete verification system, secure payment rails, and licensed professionals —
                all in one place.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {[
                {
                  icon: ShieldCheck,
                  title: "Listing Verification",
                  desc: "Every property is title-checked, surveyed, and validated before it goes live.",
                },
                {
                  icon: Lock,
                  title: "Secure Transactions",
                  desc: "Escrow-backed payments protect your funds until every condition is met.",
                },
                {
                  icon: BadgeCheck,
                  title: "Professional Validation",
                  desc: "Licensed surveyors, lawyers, and inspectors handle every assessment.",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-border/60 bg-card p-7 shadow-[var(--shadow-card)]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-border/60 bg-background">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-primary">How it works</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                A safer path from listing to closing
              </h2>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-4">
              {[
                {
                  n: "01",
                  t: "List or browse",
                  d: "Sellers submit properties; buyers explore live verified listings — no login required to browse.",
                },
                {
                  n: "02",
                  t: "Document review",
                  d: "Staff route documents to the right licensed professional for structured review.",
                },
                {
                  n: "03",
                  t: "Field verification",
                  d: "Surveyors and lawyers validate on the ground; milestones update in real time.",
                },
                {
                  n: "04",
                  t: "Secure closing",
                  d: "Escrow releases funds when every condition is met and parties are protected.",
                },
              ].map((s) => (
                <div
                  key={s.n}
                  className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]"
                >
                  <p className="text-xs font-semibold tracking-widest text-primary">{s.n}</p>
                  <h3 className="mt-3 font-semibold text-foreground">{s.t}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust / CTA */}
        <section id="trust" className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="overflow-hidden rounded-3xl bg-[var(--gradient-hero)] px-8 py-16 text-center shadow-[var(--shadow-elegant)] md:px-16">
              <FileCheck2 className="mx-auto h-10 w-10 text-primary-foreground/90" />
              <h2 className="mx-auto mt-5 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-primary-foreground md:text-4xl">
                Ready to make your next property move with full confidence?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-primary-foreground/80">
                Browse verified homes today, or create an account tailored to your role — buyer,
                seller, or licensed professional.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg" variant="secondary">
                  <Link to="/browse">Browse properties</Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/register">Create free account</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                >
                  <Link to="/login">I already have one</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                >
                  <Link to="/register" search={{ role: "professional" }}>
                    Apply as professional
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
