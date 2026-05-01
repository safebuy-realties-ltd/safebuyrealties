import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-semibold text-foreground ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShieldCheck className="h-4.5 w-4.5" strokeWidth={2.5} />
      </span>
      <span className="text-base tracking-tight">
        SafeBuy<span className="text-primary">Realties</span>
      </span>
    </Link>
  );
}
