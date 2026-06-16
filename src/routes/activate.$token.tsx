import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActivationTokenQuery, useActivateAccountMutation } from "@/hooks/use-guest-checkout";
import { ApiError } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/activate/$token")({
  component: ActivateAccountPage,
});

function ActivateAccountPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useActivationTokenQuery(token);
  const activate = useActivateAccountMutation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activated, setActivated] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-6 py-16 text-center text-sm text-muted-foreground">
          Loading activation details…
        </main>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Invalid or expired link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof ApiError ? error.message : "This activation link is no longer valid."}
          </p>
          <Button asChild className="mt-6">
            <Link to="/login">Go to login</Link>
          </Button>
        </main>
      </div>
    );
  }

  const passwordsMatch = password.length >= 8 && password === confirmPassword;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordsMatch) {
      toast.error("Passwords must match and be at least 8 characters.");
      return;
    }
    activate.mutate(
      { token, password },
      {
        onSuccess: () => {
          setActivated(true);
          toast.success("Account activated. You can now sign in.");
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : "Activation failed.");
        },
      },
    );
  };

  if (activated) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold">Account activated</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your buyer account is ready. Sign in to track due diligence and manage your property
            journey.
          </p>
          <Button className="mt-8" size="lg" onClick={() => void navigate({ to: "/login" })}>
            Sign in
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-12">
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-card)]">
          <h1 className="text-2xl font-semibold">Activate your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set a password to access your buyer dashboard and track your due diligence case.
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" className="mt-1.5" value={data.name} readOnly />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" className="mt-1.5" value={data.email} readOnly />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" className="mt-1.5" value={data.phone} readOnly />
            </div>
            <div>
              <Label htmlFor="buyerId">Buyer ID</Label>
              <Input id="buyerId" className="mt-1.5 font-mono" value={data.buyerId} readOnly />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                className="mt-1.5"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                className="mt-1.5"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={!passwordsMatch || activate.isPending}
            >
              {activate.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Activating…
                </>
              ) : (
                "Activate account"
              )}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
