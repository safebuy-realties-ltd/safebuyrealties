import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between p-8 lg:p-12">
        <Logo />
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">Log in to your SafeBuyRealties account.</p>

          <form className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a className="text-xs text-primary hover:underline" href="#">Forgot?</a>
              </div>
              <Input id="password" type="password" placeholder="••••••••" />
            </div>
            <Button asChild className="w-full" size="lg">
              <Link to="/dashboard/buyer">Log in</Link>
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account? <Link to="/register" className="font-medium text-primary hover:underline">Create one</Link>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} SafeBuyRealties</p>
      </div>
      <div className="relative hidden bg-[var(--gradient-hero)] lg:block">
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-primary-foreground">
          <blockquote className="max-w-md text-2xl font-medium leading-snug">
            "SafeBuyRealties made buying my first home effortless and trustworthy."
          </blockquote>
          <p className="mt-4 text-sm text-primary-foreground/80">— Adaeze O., verified buyer</p>
        </div>
      </div>
    </div>
  );
}
