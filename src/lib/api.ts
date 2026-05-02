const DEFAULT_API = "http://localhost:3001/api/v1";

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? DEFAULT_API;

const TOKEN_KEY = "sbr.auth.token";

export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function writeToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

export type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<ApiEnvelope<T>> {
  const token = init.token !== undefined ? init.token : readToken();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch (e) {
    const hint =
      e instanceof Error
        ? e.message
        : "Network error — check that the API is running and CORS allows this origin (localhost vs 127.0.0.1).";
    throw new ApiError(hint, "NETWORK_ERROR");
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { code?: string; message?: string; details?: unknown } | undefined;
    throw new ApiError(err?.message ?? res.statusText, err?.code ?? "HTTP_ERROR", err?.details);
  }
  return body as ApiEnvelope<T>;
}
