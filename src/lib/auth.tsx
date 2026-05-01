import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "buyer" | "seller" | "professional" | "staff" | "admin";

export type AuthUser = {
  email: string;
  name: string;
  role: Role;
};

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, role?: Role) => AuthUser;
  register: (data: { firstName: string; lastName: string; email: string; role: Role }) => AuthUser;
  logout: () => void;
};

const KEY = "sbr.auth.user";

const AuthContext = createContext<AuthState | null>(null);

function readUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(readUser());
  }, []);

  const login: AuthState["login"] = (email, role = "buyer") => {
    const name = email.split("@")[0]?.replace(/[._-]+/g, " ") || "Member";
    const u: AuthUser = { email, name: name.replace(/\b\w/g, (c) => c.toUpperCase()), role };
    window.localStorage.setItem(KEY, JSON.stringify(u));
    setUser(u);
    return u;
  };

  const register: AuthState["register"] = ({ firstName, lastName, email, role }) => {
    const u: AuthUser = { email, name: `${firstName} ${lastName}`.trim() || "Member", role };
    window.localStorage.setItem(KEY, JSON.stringify(u));
    setUser(u);
    return u;
  };

  const logout = () => {
    window.localStorage.removeItem(KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, register, logout }}>
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
  return readUser();
}
