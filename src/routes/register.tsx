import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShoppingBag, Home, Briefcase } from "lucide-react";
import {
  useAuth,
  dashboardPathForRole,
  navigateAfterAuth,
  postAuthPath,
  type ProfessionalTypeOption,
  type Role,
} from "@/lib/auth";
import { ApiError } from "@/lib/api";

type RegisterSearch = {
  redirect?: string;
  role?: string;
};

type SelfRegisterRole = "buyer" | "seller" | "professional";

const PROFESSIONAL_TYPES: { value: ProfessionalTypeOption; label: string }[] = [
  { value: "LAWYER", label: "Lawyer" },
  { value: "SURVEYOR", label: "Surveyor" },
  { value: "VALUER", label: "Valuer" },
  { value: "ARCHITECT", label: "Architect" },
  { value: "ENGINEER", label: "Engineer" },
  { value: "BUILDER", label: "Builder" },
  { value: "QUANTITY_SURVEYOR", label: "Quantity surveyor" },
];

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): RegisterSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    role: typeof search.role === "string" ? search.role : undefined,
  }),
  component: RegisterPage,
});

const roles: {
  id: SelfRegisterRole;
  label: string;
  desc: string;
  explainer: string;
  icon: typeof ShoppingBag;
}[] = [
  {
    id: "buyer",
    label: "Buyer",
    desc: "Browse and purchase verified properties",
    explainer:
      "Search live listings, complete due diligence, and pay securely through escrow when you are ready to buy.",
    icon: ShoppingBag,
  },
  {
    id: "seller",
    label: "Seller",
    desc: "List and sell with verification",
    explainer:
      "Submit your property for staff verification, go live with a trusted badge, and manage offers from qualified buyers.",
    icon: Home,
  },
  {
    id: "professional",
    label: "Professional",
    desc: "Lawyers, surveyors, and licensed experts",
    explainer:
      "Join as a licensed expert to review documents, conduct surveys, and support verified transactions on the platform.",
    icon: Briefcase,
  },
];

function parseInitialRole(roleParam: string | undefined): SelfRegisterRole {
  if (roleParam === "seller" || roleParam === "professional") return roleParam;
  return "buyer";
}

function RegisterPage() {
  const { register, isReady } = useAuth();
  const navigate = useNavigate();
  const { redirect, role: roleParam } = Route.useSearch();
  const [role, setRole] = useState<SelfRegisterRole>(() => parseInitialRole(roleParam));
  const [professionalType, setProfessionalType] = useState<ProfessionalTypeOption>("LAWYER");
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (roleParam) setRole(parseInitialRole(roleParam));
  }, [roleParam]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !email.trim() || !password) {
      setError("Fill in your name, email, and password.");
      return;
    }
    if (role === "professional" && !professionalType) {
      setError("Select your professional type.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const user = await register({
        firstName,
        lastName,
        email,
        password,
        role,
        ...(role === "professional" ? { professionalType } : {}),
      });
      const target = postAuthPath(
        redirect,
        user.role === "professional"
          ? "/onboarding/professional"
          : dashboardPathForRole(user.role as Role),
      );
      navigateAfterAuth(navigate, target);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create account.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loginSearch = redirect ? { redirect } : undefined;
  const selectedRole = roles.find((r) => r.id === role);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden bg-hero-gradient lg:block">
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
          <h2 className="max-w-md text-3xl font-semibold leading-tight">
            Join the verified real estate network.
          </h2>
          <p className="mt-4 max-w-md text-white/80">
            Create your account in under a minute and start transacting with confidence.
          </p>
        </div>
      </div>
      <div className="flex flex-col justify-between p-8 lg:p-12">
        <Logo />
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create account</h1>
          {selectedRole ? (
            <p className="mt-2 text-sm text-muted-foreground">{selectedRole.explainer}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Choose buyer, seller, or professional to get started.
            </p>
          )}

          <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all sm:p-3.5 ${
                  role === r.id
                    ? "border-primary bg-primary-soft shadow-[var(--shadow-card)]"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    role === r.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <r.icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold text-foreground sm:text-sm">{r.label}</span>
              </button>
            ))}
          </div>

          {role === "professional" && (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary-soft/40 p-4">
              <Label htmlFor="professionalType" className="text-sm font-semibold text-foreground">
                Professional type
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Tell us your licensed specialty so we can route the right work to you.
              </p>
              <Select
                value={professionalType}
                onValueChange={(v) => setProfessionalType(v as ProfessionalTypeOption)}
              >
                <SelectTrigger id="professionalType" className="mt-3 w-full bg-background">
                  <SelectValue placeholder="Select your professional type" />
                </SelectTrigger>
                <SelectContent>
                  {PROFESSIONAL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first">First name</Label>
                <Input
                  id="first"
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => setFirst(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last">Last name</Label>
                <Input
                  id="last"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLast(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={loading || !isReady}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              search={loginSearch}
              className="font-medium text-primary hover:underline"
            >
              Log in
            </Link>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} SafeBuyRealties
        </p>
      </div>
    </div>
  );
}
