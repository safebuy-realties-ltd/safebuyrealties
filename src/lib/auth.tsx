import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest, readToken, writeToken } from "@/lib/api";

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

const USER_KEY = "sbr.auth.user";

function readUserCache(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function persistUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (!user) localStorage.removeItem(USER_KEY);
  else localStorage.setItem(USER_KEY, JSON.stringify(user));
}

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
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const token = readToken();
      if (!token) {
        persistUser(null);
        if (!cancelled) {
          setUser(null);
          setIsReady(true);
        }
        return;
      }
      try {
        const envelope = await apiRequest<ApiUser>("/auth/me", {
          method: "GET",
          token,
        });
        const next = mapApiUser(envelope.data);
        if (!cancelled) {
          setUser(next);
          persistUser(next);
        }
      } catch {
        writeToken(null);
        persistUser(null);
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
    const envelope = await apiRequest<{ accessToken: string; user: ApiUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      token: null,
    });
    const { accessToken, user: u } = envelope.data;
    writeToken(accessToken);
    const next = mapApiUser(u);
    setUser(next);
    persistUser(next);
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
      const envelope = await apiRequest<{ accessToken: string; user: ApiUser }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role.toUpperCase(),
        }),
        token: null,
      });
      const { accessToken, user: u } = envelope.data;
      writeToken(accessToken);
      const next = mapApiUser(u);
      setUser(next);
      persistUser(next);
      return next;
    },
    [],
  );

  const logout = useCallback(() => {
    writeToken(null);
    persistUser(null);
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

/** SSR-safe synchronous check used by route guards. */
export function getStoredUser(): AuthUser | null {
  return readUserCache();
}
