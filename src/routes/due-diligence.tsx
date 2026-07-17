import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  MapPinned,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/due-diligence")({
  component: DueDiligenceLandingPage,
});

const schedules = [
  {
    title: "Schedule A - Legal Due Diligence",
    description: "Ownership, title history, encumbrances, and legal document review.",
    icon: Scale,
  },
  {
    title: "Schedule B - Environmental Review",
    description: "Flooding, drainage, land-use, and neighbourhood environmental signals.",
    icon: MapPinned,
  },
  {
    title: "Schedule C - Physical Inspection",
    description: "On-site checks for boundaries, structures, access, and visible condition.",
    icon: ClipboardCheck,
  },
  {
    title: "Schedule D - Security Assessment",
    description: "Neighbourhood safety, access routes, and occupancy-related risk context.",
    icon: ShieldCheck,
  },
] as const;

function DueDiligenceLandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-border/60">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-[1.15fr_0.85fr] md:py-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Standalone due diligence
              </div>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
                Request property due diligence{" "}
                <span className="text-primary">on or off the platform.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
                SafeBuyRealties opens a dedicated case, assigns staff review, and delivers a
                verdict-backed report for any property you want assessed.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/due-diligence/request">
                    Start a request
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/browse">Browse verified listings</Link>
                </Button>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Guest and buyer friendly
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Schedules A-D or full bundle
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Verdict and report delivery
                </span>
              </div>
            </div>
            <div className="rounded-3xl bg-hero-gradient p-8 text-white shadow-[var(--shadow-elegant)]">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary-foreground/80">
                How the service works
              </p>
              <ol className="mt-6 space-y-5">
                {[
                  "Choose a live SafeBuyRealties listing or enter an off-platform property address.",
                  "Select individual schedules or the full due diligence bundle.",
                  "Pay to open the case and receive your service ID and case reference.",
                  "Our staff progress the case to complete and attach the final report.",
                ].map((step, index) => (
                  <li key={step} className="flex gap-4">
                    <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-primary-foreground/90">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="border-b border-border/60 bg-secondary/40">
          <div className="mx-auto max-w-7xl px-6 py-18 md:py-22">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-primary">Coverage</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Structured around Schedules A-D
              </h2>
              <p className="mt-3 text-muted-foreground">
                Every request is anchored to the four due diligence schedules already used by the
                operations team.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {schedules.map((schedule) => (
                <div
                  key={schedule.title}
                  className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <schedule.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-foreground">{schedule.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {schedule.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border/60 bg-background">
          <div className="mx-auto max-w-7xl px-6 py-18 md:py-22">
            <div className="grid gap-6 lg:grid-cols-3">
              {[
                {
                  title: "On-platform properties",
                  body: "Use a SafeBuyRealties listing ID to request standalone due diligence without placing the listing under offer.",
                },
                {
                  title: "Off-platform properties",
                  body: "Add the address, state, title reference, and seller details for any property outside the marketplace.",
                },
                {
                  title: "Staff-managed delivery",
                  body: "Internal teams move the case from paid to in progress to complete, then upload the report and verdict.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]"
                >
                  <FileCheck2 className="h-8 w-8 text-primary" />
                  <h3 className="mt-4 text-xl font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-18 md:py-22">
          <div className="overflow-hidden rounded-3xl bg-hero-gradient px-8 py-14 text-center text-white shadow-[var(--shadow-elegant)] md:px-14">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Ready to open a due diligence case?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-primary-foreground/90">
              Start with a listing or an address, select your schedules, and get a service ID in
              minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-white text-primary shadow-md hover:bg-white/90 hover:text-primary"
              >
                <Link to="/due-diligence/request">Start a request</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/80 bg-transparent text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
              >
                <Link to="/dashboard/buyer/due-diligence">Track my cases</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
