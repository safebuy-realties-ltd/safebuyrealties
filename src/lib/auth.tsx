import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api";

export type Role = "buyer" | "seller" | "professional" | "staff" | "admin";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  professionalType?: string | null;
};

type SelfRegisterRole = "buyer" | "seller";

type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  professionalType?: string | null;
};

function mapApiUser(u: ApiUser): AuthUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    professionalType: u.professionalType ?? null,
  };
}

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isReady: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: SelfRegisterRole;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * SECURITY: We never trust any client-side cache (localStorage / sessionStorage)
 * for the authenticated user or role. The only source of truth is the server's
 * /auth/me endpoint, which validates the HttpOnly session cookie. Any cached
 * user state is held in React memory only and reset on every mount.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Defensive: scrub any stale auth artifacts a previous build may have written.
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("sbr.auth.user");
        localStorage.removeItem("sbr.auth.token");
      } catch {
        /* ignore */
      }
    }

    async function hydrate() {
      try {
        const envelope = await apiRequest<ApiUser>("/auth/me", { method: "GET" });
        if (!cancelled) setUser(mapApiUser(envelope.data));
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const envelope = await apiRequest<{ user: ApiUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const next = mapApiUser(envelope.data.user);
    setUser(next);
    return next;
  }, []);

  const register = useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      role: SelfRegisterRole;
    }) => {
      const envelope = await apiRequest<{ user: ApiUser }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role.toUpperCase(),
        }),
      });
      const next = mapApiUser(envelope.data.user);
      setUser(next);
      return next;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      /* still clear local state */
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isReady,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function dashboardPathForRole(role: Role): string {
  return `/dashboard/${role}`;
}
