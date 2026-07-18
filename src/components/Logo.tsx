import { Link } from "@tanstack/react-router";
import brandLogo from "@/assets/brand/safebuy-logo.svg";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 font-semibold text-foreground ${className}`}>
      <img src={brandLogo} alt="" className="h-8 w-8 text-primary" aria-hidden />
      <span className="font-display text-base tracking-tight">
        SafeBuy<span className="text-primary">Realties</span>
      </span>
    </Link>
  );
}
