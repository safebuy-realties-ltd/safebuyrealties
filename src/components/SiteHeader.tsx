import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { dashboardPathForRole, useAuth } from "@/lib/auth";

function useRegisterSearch() {
  const { pathname, searchStr } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, searchStr: s.location.searchStr }),
  });
  if (pathname === "/" || pathname === "/login" || pathname === "/register") return undefined;
  const redirect = `${pathname}${searchStr}`;
  return { redirect };
}

export function SiteHeader() {
  const { user, isAuthenticated, isReady, logout } = useAuth();
  const navigate = useNavigate();
  const registerSearch = useRegisterSearch();

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <Link to="/browse" className="hover:text-foreground transition-colors">
            Browse properties
          </Link>
          <a href="/#personas" className="hover:text-foreground transition-colors">
            Who it&apos;s for
          </a>
          <a href="/#features" className="hover:text-foreground transition-colors">
            Features
          </a>
          <a href="/#how" className="hover:text-foreground transition-colors">
            How it works
          </a>
          <a href="/#trust" className="hover:text-foreground transition-colors">
            Trust & Safety
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {isReady && isAuthenticated && user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to={dashboardPathForRole(user.role)}>Dashboard</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register" search={registerSearch}>
                  Get started
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
