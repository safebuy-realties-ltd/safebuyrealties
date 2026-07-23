import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Briefcase, ClipboardCheck, Home, ShoppingBag } from "lucide-react";
import brandLogo from "@/assets/brand/safebuy-logo.svg";

const LANDING_BG =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1800&q=80";

export const Route = createFileRoute("/")({
  component: SimpleLanding,
});

const paths = [
  {
    id: "due-diligence",
    label: "Request due diligence",
    icon: ClipboardCheck,
    to: "/due-diligence/request" as const,
  },
  {
    id: "buying",
    label: "I'm buying a property",
    icon: ShoppingBag,
    to: "/browse" as const,
  },
  {
    id: "selling",
    label: "Owner or agent",
    icon: Home,
    to: "/register" as const,
    search: { role: "seller" as const },
  },
  {
    id: "professional",
    label: "I'm a professional",
    icon: Briefcase,
    to: "/register" as const,
    search: { role: "professional" as const },
  },
] as const;

function SimpleLanding() {
  return (
    <div className="landing-shell relative min-h-svh overflow-hidden text-white">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${LANDING_BG})` }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(115deg,oklch(0.22_0.06_25_/_0.92)_0%,oklch(0.28_0.09_22_/_0.78)_48%,oklch(0.35_0.1_20_/_0.55)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_18%_20%,oklch(1_0_0_/_0.14),transparent_34%),radial-gradient(circle_at_82%_78%,oklch(0.55_0.14_25_/_0.35),transparent_40%)]"
      />

      <main className="relative z-10 mx-auto flex min-h-svh w-full max-w-7xl flex-col justify-center px-6 py-10 md:px-10 lg:px-14">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <section className="landing-paths order-2 lg:order-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
              {paths.map((path, index) => (
                <Link
                  key={path.id}
                  to={path.to}
                  search={"search" in path ? path.search : undefined}
                  className="landing-path group relative flex min-h-[8.5rem] flex-col justify-between rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-white/45 hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:min-h-[10rem] sm:p-6"
                  style={{ animationDelay: `${120 + index * 80}ms` }}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_10px_30px_-12px_oklch(0.35_0.12_22_/_0.9)] transition group-hover:scale-105">
                    <path.icon className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                  <div className="mt-6 flex items-end justify-between gap-3">
                    <h2 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-[1.65rem]">
                      {path.label}
                    </h2>
                    <ArrowUpRight className="mb-1 h-5 w-5 shrink-0 text-white/70 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="landing-brand order-1 lg:order-2 lg:justify-self-end">
            <div className="flex max-w-md flex-col items-start gap-5 lg:items-end lg:text-right">
              <img
                src={brandLogo}
                alt="SafeBuyRealties"
                className="h-16 w-16 text-primary drop-shadow-lg sm:h-20 sm:w-20"
              />
              <div>
                <p className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                  SafeBuy
                  <span className="text-[oklch(0.86_0.06_35)]">Realties</span>
                </p>
              </div>
              <Link
                to="/login"
                className="text-sm font-medium text-white/70 underline-offset-4 transition hover:text-white hover:underline"
              >
                Sign in
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
