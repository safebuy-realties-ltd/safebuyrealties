import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, dashboardPathForRole } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, isReady } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const user = await login(email, password);
      navigate({ to: dashboardPathForRole(user.role) });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not sign in.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between p-8 lg:p-12">
        <Logo />
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Log in to your SafeBuyRealties account.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a className="text-xs text-primary hover:underline" href="#">
                  Forgot?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={loading || !isReady}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} SafeBuyRealties
        </p>
      </div>
      <div className="relative hidden bg-[var(--gradient-hero)] lg:block">
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-primary-foreground">
          <h2 className="max-w-md text-3xl font-semibold leading-tight">
            Verified listings. Safer transactions.
          </h2>
          <p className="mt-4 max-w-md text-primary-foreground/80">
            Sign in to continue due diligence, manage listings, and collaborate with professionals.
          </p>
        </div>
      </div>
    </div>
  );
}
