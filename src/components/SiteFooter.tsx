import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-secondary/40">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-2">
            <Logo />
            <p className="text-sm text-muted-foreground">Verified real estate. Secured transactions.</p>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} SafeBuyRealties. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
