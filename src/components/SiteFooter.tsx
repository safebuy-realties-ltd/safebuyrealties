import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-secondary/40">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-2">
            <Logo />
            <p className="text-sm text-muted-foreground">
              Verified real estate. Secured transactions.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <Link to="/login" className="hover:text-foreground">
                Staff sign in
              </Link>
              <Link to="/login" className="hover:text-foreground">
                Admin sign in
              </Link>
            </nav>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} SafeBuyRealties. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
