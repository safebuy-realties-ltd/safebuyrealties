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
  Building2,
  Search,
  ClipboardCheck,
  Eye,
  KeyRound,
  Heart,
  Upload,
  Users,
  Scale,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/components/ListingCard";
import { ListingCardSkeleton } from "@/components/ListingCardSkeleton";
import { usePublicListingsQuery } from "@/hooks/use-listings";
import { listingDtoToCard } from "@/lib/listing-card-map";

export const Route = createFileRoute("/home/classic")({
  component: ClassicLanding,
});

const heroPaths = [
  {
    id: "due-diligence",
    label: "I need due diligence",
    headline: "Verify before you pay",
    description:
      "Order Schedules A–D for any property — on SafeBuy or off-platform. No account required to start.",
    icon: ClipboardCheck,
    to: "/due-diligence/request" as const,
    accent: "from-teal-500/15 to-emerald-600/10",
    featured: true,
  },
  {
    id: "buying",
    label: "I'm buying",
    headline: "Find a verified home",
    description:
      "Browse live listings, compare title-checked properties, and buy with escrow protection.",
    icon: ShoppingBag,
    to: "/browse" as const,
    accent: "from-emerald-500/10 to-emerald-600/5",
  },
  {
    id: "selling",
    label: "I'm selling",
    headline: "List with proof",
    description:
      "Submit your property, pass verification, and reach buyers who trust the SafeBuy badge.",
    icon: Home,
    to: "/register" as const,
    search: { role: "seller" },
    accent: "from-blue-500/10 to-blue-600/5",
  },
  {
    id: "professional",
    label: "I'm a professional",
    headline: "Work on verified deals",
    description:
      "Lawyers, surveyors, and inspectors deliver structured reports on active transactions.",
    icon: Briefcase,
    to: "/register" as const,
    search: { role: "professional" },
    accent: "from-amber-500/10 to-amber-600/5",
  },
] as const;

const personas = [
  {
    id: "due-diligence",
    icon: ClipboardCheck,
    title: "Due diligence clients",
    headline: "Our flagship protection service",
    description:
      "Whether the property is listed here or you found it elsewhere, run Legal, Environmental, Physical, and Security checks — then pay and let SafeBuy coordinate the report.",
    benefits: [
      { icon: ShieldCheck, text: "No signup required to request and pay" },
      { icon: FileCheck2, text: "Schedules A–D or the full due diligence bundle" },
      { icon: BadgeCheck, text: "Staff-managed case with a clear proceed verdict" },
    ],
    cta: { label: "Request due diligence", to: "/due-diligence/request" as const },
    gradient:
      "bg-gradient-to-br from-teal-50 to-emerald-100/50 dark:from-teal-950/40 dark:to-emerald-900/20",
    iconBg: "bg-teal-700 text-white",
  },
  {
    id: "buyers",
    icon: ShoppingBag,
    title: "Buyers",
    headline: "Buy property you can trust",
    description:
      "Every listing on SafeBuyRealties passes independent title and survey checks before it goes live — so you are not guessing about ownership or paperwork.",
    benefits: [
      { icon: Search, text: "Browse verified homes without signing up" },
      { icon: Heart, text: "Save favorites and schedule inspections" },
      { icon: Lock, text: "Pay through escrow until closing conditions are met" },
    ],
    cta: { label: "Start browsing", to: "/browse" as const },
    gradient:
      "bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20",
    iconBg: "bg-emerald-600 text-white",
  },
  {
    id: "sellers",
    icon: Home,
    title: "Sellers",
    headline: "Sell faster with verified proof",
    description:
      "List once, upload your documents, and let our team handle verification. Live listings attract serious buyers who already trust the platform.",
    benefits: [
      { icon: Upload, text: "Guided listing and document upload" },
      { icon: ClipboardCheck, text: "Track review from draft to live" },
      { icon: Users, text: "Qualified buyers routed through SafeBuy" },
    ],
    cta: { label: "List your property", to: "/register" as const, search: { role: "seller" } },
    gradient:
      "bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20",
    iconBg: "bg-blue-600 text-white",
  },
  {
    id: "professionals",
    icon: Briefcase,
    title: "Professionals",
    headline: "Licensed experts on real deals",
    description:
      "Receive assigned tasks on active transactions, upload credentials for approval, and deliver reports that feed directly into buyer due diligence.",
    benefits: [
      { icon: Scale, text: "Credential verification and task inbox" },
      { icon: FileCheck2, text: "Structured deliverables tied to listings" },
      { icon: BadgeCheck, text: "Transparent milestone completion" },
    ],
    cta: {
      label: "Join as a professional",
      to: "/register" as const,
      search: { role: "professional" },
    },
    gradient:
      "bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20",
    iconBg: "bg-amber-600 text-white",
  },
] as const;

const buyerSteps = [
  {
    icon: Search,
    title: "Browse verified listings",
    description: "Explore live properties across Nigeria — no account needed to start looking.",
  },
  {
    icon: Eye,
    title: "Inspect with confidence",
    description: "Review title status, schedule viewings, and see exactly what has been verified.",
  },
  {
    icon: ClipboardCheck,
    title: "Complete due diligence",
    description: "Licensed lawyers and surveyors validate documents and field conditions for you.",
  },
  {
    icon: KeyRound,
    title: "Close with escrow protection",
    description: "Funds stay secured until every condition is met — then you get the keys.",
  },
] as const;

/** Previous marketing homepage — kept inactive at `/home/classic` while `/` uses the simplified landing. */
function ClassicLanding() {
  const { data, isLoading, isError } = usePublicListingsQuery({ pageSize: 12 });
  const featured = useMemo(() => (data?.listings ?? []).map(listingDtoToCard), [data?.listings]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[var(--gradient-subtle)]" />
          <div className="mx-auto max-w-7xl px-6 pt-16 pb-12 md:pt-24 md:pb-16">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Nigeria&apos;s verified property marketplace
              </div>
              <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
                Verify before you pay —{" "}
                <span className="text-primary">due diligence that protects every deal.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
                SafeBuyRealties&apos; flagship service is standalone due diligence for any property
                in Nigeria. Browse verified listings, list with proof, or join as a licensed
                professional — all on the same trusted platform.
              </p>
            </div>

            {/* Four prominent paths — due diligence first */}
            <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {heroPaths.map((path) => (
                <Link
                  key={path.id}
                  to={path.to}
                  search={"search" in path ? path.search : undefined}
                  className={`group relative flex flex-col rounded-2xl border bg-gradient-to-br ${path.accent} p-6 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)] ${
                    "featured" in path && path.featured
                      ? "border-primary/40 ring-1 ring-primary/20"
                      : "border-border/60"
                  }`}
                >
                  {"featured" in path && path.featured && (
                    <span className="absolute top-3 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                      Flagship
                    </span>
                  )}
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                    <path.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-primary">
                    {path.label}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">{path.headline}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {path.description}
                  </p>
                  <span className="mt-4 inline-flex items-center text-sm font-medium text-primary transition-all group-hover:gap-2">
                    {path.id === "due-diligence" ? "Start request" : "Get started"}
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Standalone due diligence
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Title-verified listings
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Escrow-secured payments
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Licensed professionals
              </span>
            </div>
          </div>
        </section>

        {/* Featured listings — immediately below hero */}
        <section id="featured" className="border-t border-border/60 bg-background">
          <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
            <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
              <div className="max-w-xl">
                <p className="text-sm font-medium text-primary">Live right now</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Verified properties for sale
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Browse real listings on the marketplace today — each verified before going public.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/browse">
                  View all properties <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {isLoading && (
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <ListingCardSkeleton key={i} />
                ))}
              </div>
            )}
            {isError && (
              <div className="mt-10 rounded-xl border border-border/60 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                Featured listings are temporarily unavailable.{" "}
                <Link to="/browse" className="text-primary underline">
                  Browse the marketplace
                </Link>{" "}
                directly.
              </div>
            )}
            {!isLoading && !isError && featured.length > 0 && (
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}
            {!isLoading && !isError && featured.length === 0 && (
              <div className="mt-10 flex flex-col items-center rounded-xl border border-border/60 bg-card px-6 py-14 text-center shadow-[var(--shadow-card)]">
                <Building2 className="h-10 w-10 text-muted-foreground" />
                <p className="mt-4 text-sm font-medium text-foreground">
                  New listings arriving soon
                </p>
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

        {/* Who we serve — 3 external personas only */}
        <section id="personas" className="border-t border-border/60 bg-secondary/40">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-primary">Who we serve</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Due diligence first — then buying, selling, and pros
              </h2>
              <p className="mt-3 text-muted-foreground">
                Start with our flagship verification service, or use the marketplace for listings,
                sales, and licensed professional work.
              </p>
            </div>

            <div className="mt-14 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
              {personas.map((p) => (
                <div
                  key={p.id}
                  className={`flex flex-col overflow-hidden rounded-2xl border border-border/60 shadow-[var(--shadow-card)] ${p.gradient}`}
                >
                  <div className="p-7 pb-0">
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ${p.iconBg}`}
                    >
                      <p.icon className="h-6 w-6" />
                    </span>
                    <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-primary">
                      {p.title}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-foreground">{p.headline}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {p.description}
                    </p>
                  </div>
                  <div className="mt-6 flex-1 bg-card/80 p-7 backdrop-blur-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      What you get
                    </p>
                    <ul className="mt-4 space-y-4">
                      {p.benefits.map((b) => (
                        <li key={b.text} className="flex items-start gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                            <b.icon className="h-4 w-4" />
                          </span>
                          <span className="pt-1 text-sm text-foreground">{b.text}</span>
                        </li>
                      ))}
                    </ul>
                    <Button asChild className="mt-6 w-full" size="sm">
                      <Link to={p.cta.to} search={"search" in p.cta ? p.cta.search : undefined}>
                        {p.cta.label}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust pillars */}
        <section id="features" className="border-t border-border/60 bg-background">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
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

        {/* How it works — buyer-focused */}
        <section id="how" className="border-t border-border/60 bg-secondary/40">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-primary">How it works</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Your path from browse to keys
              </h2>
              <p className="mt-3 text-muted-foreground">
                Four clear steps for buyers — from discovering a verified home to closing with full
                protection.
              </p>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {buyerSteps.map((step, i) => (
                <div
                  key={step.title}
                  className="relative rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-xs font-semibold tracking-widest text-primary">
                    Step {i + 1}
                  </p>
                  <h3 className="mt-2 font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust / CTA — brand gradient panel with light text */}
        <section id="trust" className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
            <div className="bg-hero-gradient overflow-hidden rounded-3xl px-8 py-16 text-center text-white shadow-[var(--shadow-elegant)] md:px-16">
              <FileCheck2 className="mx-auto h-10 w-10 text-white/90" />
              <h2 className="mx-auto mt-5 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Ready to make your next property move with full confidence?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-white/90">
                Browse verified homes today, or create a free account as a buyer, seller, or
                licensed professional.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-[oklch(0.35_0.1_155)] shadow-md hover:bg-white/90 hover:text-[oklch(0.32_0.1_155)]"
                >
                  <Link to="/browse">Browse properties</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-[oklch(0.35_0.1_155)] shadow-md hover:bg-white/90 hover:text-[oklch(0.32_0.1_155)]"
                >
                  <Link to="/register">Create free account</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/80 bg-transparent text-white hover:bg-white/15 hover:text-white"
                >
                  <Link to="/register" search={{ role: "professional" }}>
                    Apply as professional
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/80 bg-transparent text-white hover:bg-white/15 hover:text-white"
                >
                  <Link to="/login">Sign in</Link>
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
