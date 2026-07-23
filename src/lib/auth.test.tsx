import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// --- Mocks: TanStack Router primitives used by DashboardLayout ---
const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
  Outlet: () => <div data-testid="protected-outlet">PROTECTED</div>,
  useNavigate: () => navigate,
  useRouterState: () => "/dashboard/buyer",
}));

// --- Mocks: API layer. /auth/me always rejects (no valid HttpOnly cookie). ---
vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(async () => {
    throw new Error("UNAUTHORIZED");
  }),
  ApiError: class ApiError extends Error {},
  API_BASE_URL: "http://test",
}));

import { AuthProvider } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

function renderProtected(role: "buyer" | "admin" = "buyer") {
  return render(
    <AuthProvider>
      <DashboardLayout role={role} />
    </AuthProvider>,
  );
}

describe("Auth guard against forged localStorage cache", () => {
  it("redirects to /login when no valid session cookie exists, even if localStorage is forged", async () => {
    // Attacker forges a cached admin user via DevTools.
    localStorage.setItem(
      "sbr.auth.user",
      JSON.stringify({
        id: "attacker",
        email: "attacker@evil.test",
        name: "Attacker",
        role: "admin",
      }),
    );
    localStorage.setItem("sbr.auth.token", "forged.jwt.token");

    renderProtected("admin");

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/login",
        search: { redirect: "/dashboard/buyer" },
      });
    });

    // Protected outlet must NEVER render.
    expect(screen.queryByTestId("protected-outlet")).toBeNull();
  });

  it("never renders protected UI while auth is unresolved", async () => {
    renderProtected("buyer");
    expect(screen.queryByTestId("protected-outlet")).toBeNull();
    expect(screen.getByText(/Loading workspace/i)).toBeInTheDocument();
  });

  it("scrubs forged auth artifacts from localStorage on mount", async () => {
    localStorage.setItem("sbr.auth.user", JSON.stringify({ role: "admin" }));
    localStorage.setItem("sbr.auth.token", "forged");

    renderProtected("buyer");

    await waitFor(() => {
      expect(localStorage.getItem("sbr.auth.user")).toBeNull();
      expect(localStorage.getItem("sbr.auth.token")).toBeNull();
    });
  });
});
