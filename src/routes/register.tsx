import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShoppingBag, Home, Briefcase } from "lucide-react";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

const roles = [
  { id: "buyer", label: "Buyer", desc: "Browse and purchase verified properties", icon: ShoppingBag },
  { id: "seller", label: "Seller", desc: "List and sell with verification", icon: Home },
  { id: "professional", label: "Professional", desc: "Surveyor, lawyer, or inspector", icon: Briefcase },
] as const;

function RegisterPage() {
  const [role, setRole] = useState<typeof roles[number]["id"]>("buyer");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden bg-[var(--gradient-hero)] lg:block">
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-primary-foreground">
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Join the verified real estate network.</h2>
          <p className="mt-4 max-w-md text-primary-foreground/80">Create your account in under a minute and start transacting with confidence.</p>
        </div>
      </div>
      <div className="flex flex-col justify-between p-8 lg:p-12">
        <Logo />
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create account</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose your role to get started.</p>

          <div className="mt-6 grid gap-2">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  role === r.id
                    ? "border-primary bg-primary-soft shadow-[var(--shadow-card)]"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${role === r.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  <r.icon className="h-4 w-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-foreground">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.desc}</span>
                </span>
              </button>
            ))}
          </div>

          <form className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first">First name</Label>
                <Input id="first" placeholder="Jane" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last">Last name</Label>
                <Input id="last" placeholder="Doe" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" />
            </div>
            <Button asChild className="w-full" size="lg">
              <Link to={role === "seller" ? "/dashboard/seller" : role === "professional" ? "/dashboard/professional" : "/dashboard/buyer"}>
                Create account
              </Link>
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} SafeBuyRealties</p>
      </div>
    </div>
  );
}
