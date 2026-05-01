import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, FileCheck2, Lock, BadgeCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
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
                Trusted by 12,000+ verified buyers and sellers
              </div>
              <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
                Real estate you can{" "}
                <span className="text-primary">actually trust.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
                SafeBuyRealties verifies every listing, document, and professional involved in your
                transaction — so buying or selling property is finally safe, simple, and certain.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg" className="shadow-[var(--shadow-elegant)]">
                  <Link to="/register">Get started <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/login">Log in</Link>
                </Button>
              </div>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Verified titles</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Escrow-secured payments</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Licensed professionals</span>
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

        {/* Features */}
        <section id="features" className="border-t border-border/60 bg-background">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-primary">Why SafeBuyRealties</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Confidence built into every step
              </h2>
              <p className="mt-3 text-muted-foreground">
                A complete verification system, secure payment rails, and licensed professionals — all in one place.
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
                <div key={f.title} className="rounded-2xl border border-border/60 bg-card p-7 shadow-[var(--shadow-card)]">
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
        <section id="how" className="border-t border-border/60 bg-secondary/40">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-primary">How it works</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">A safer path from listing to closing</h2>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-4">
              {[
                { n: "01", t: "List or browse", d: "Create a listing or explore verified properties." },
                { n: "02", t: "Document review", d: "Our staff routes documents to the right professional." },
                { n: "03", t: "Field verification", d: "Surveyors and lawyers validate on the ground." },
                { n: "04", t: "Secure closing", d: "Escrow releases funds when conditions are met." },
              ].map((s) => (
                <div key={s.n} className="rounded-xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
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
                Join thousands using SafeBuyRealties to verify, transact, and close — securely.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg" variant="secondary">
                  <Link to="/register">Create free account</Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">
                  <Link to="/login">I already have one</Link>
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
