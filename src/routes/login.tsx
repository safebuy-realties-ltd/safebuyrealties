import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, Home, Shield, ShoppingBag } from "lucide-react";
import { Logo } from "@/components/Logo";

type LoginSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginHubPage,
});

const portals = [
  {
    to: "/login/buyer" as const,
    label: "Buyer",
    description: "Browse listings, due diligence, and purchases",
    icon: ShoppingBag,
  },
  {
    to: "/login/seller" as const,
    label: "Property owner / agent",
    description: "List properties and manage seller documents",
    icon: Home,
  },
  {
    to: "/login/professional" as const,
    label: "Professional",
    description: "Lawyers, surveyors, and licensed experts",
    icon: Briefcase,
  },
  {
    to: "/login/admin" as const,
    label: "Platform staff",
    description: "SafeBuyRealties staff and administrators",
    icon: Shield,
  },
] as const;

function LoginHubPage() {
  const { redirect } = Route.useSearch();
  const search = redirect ? { redirect } : undefined;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between p-8 lg:p-12">
        <Logo />
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose the portal that matches your account type.
          </p>

          <div className="mt-8 grid gap-3">
            {portals.map((portal) => (
              <Link
                key={portal.to}
                to={portal.to}
                search={search}
                className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary-soft/30"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <portal.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">
                    {portal.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {portal.description}
                  </span>
                </span>
              </Link>
            ))}
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link
              to="/register"
              search={search}
              className="font-medium text-primary hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} SafeBuyRealties
        </p>
      </div>
      <div className="relative hidden bg-hero-gradient lg:block">
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
          <h2 className="max-w-md text-3xl font-semibold leading-tight">
            Verified listings. Safer transactions.
          </h2>
          <p className="mt-4 max-w-md text-white/80">
            Each portal is tailored to your role — buyers, sellers, professionals, and platform
            staff sign in separately for the right experience.
          </p>
        </div>
      </div>
    </div>
  );
}
