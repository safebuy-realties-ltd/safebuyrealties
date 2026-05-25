const DEFAULT_API = "http://localhost:3001/api/v1";

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? DEFAULT_API;

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
  storageKey: string;
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
