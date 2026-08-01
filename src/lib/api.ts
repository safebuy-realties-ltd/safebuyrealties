/** Same-origin in production (Vercel /api/v1 rewrite); Vite proxy in local dev. */
const DEFAULT_API = "/api/v1";

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  // Session cookies require same-origin requests. Ignore absolute VITE_API_URL values
  // (e.g. Render host). Vercel proxies /api/v1 using API_PROXY_TARGET in vercel.mjs.
  if (configured?.startsWith("/")) {
    return configured.replace(/\/$/, "") || DEFAULT_API;
  }
  return DEFAULT_API;
}

export const API_BASE_URL = resolveApiBaseUrl();

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

export type DocumentDto = {
  id: string;
  listingId: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /**
   * Where to fetch the bytes, root-relative, ready to drop into `src` or `href`.
   *
   * This replaced `storageKey` in E3-S1d-3. The key was a path into the bucket, and the client
   * turned it into `/uploads/<key>` itself — an unauthenticated URL that anyone holding it could
   * fetch, which is how title deeds became public. This names the API's authorized reader instead,
   * so the request carries the session cookie and the server decides, per request, whether these
   * particular bytes may leave. Holding the URL grants nothing.
   */
  url: string;
  createdAt: string;
  status?: string;
};

export async function uploadDocument(params: {
  listingId: string;
  category: string;
  file: File;
}): Promise<ApiEnvelope<DocumentDto>> {
  const form = new FormData();
  form.append("listingId", params.listingId);
  form.append("category", params.category);
  form.append("file", params.file);
  return apiRequest<DocumentDto>("/documents/upload", {
    method: "POST",
    body: form,
  });
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch (e) {
    const hint =
      e instanceof Error
        ? e.message
        : "Network error — check that the API is running and CORS allows this origin.";
    throw new ApiError(hint, "NETWORK_ERROR");
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { code?: string; message?: string; details?: unknown } | undefined;
    throw new ApiError(err?.message ?? res.statusText, err?.code ?? "HTTP_ERROR", err?.details);
  }
  return body as ApiEnvelope<T>;
}
