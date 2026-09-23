export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); this.name = "ApiError"; }
}
export async function apiRequest<T>(path: string, options: { method?: string; body?: unknown; csrf?: string | null; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? "GET", credentials: "same-origin", cache: "no-store", signal: options.signal,
    headers: { accept: "application/json", ...(options.body !== undefined ? { "content-type": "application/json" } : {}), ...(options.csrf ? { "x-csrf-token": options.csrf } : {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
    if (response.status === 401 && path !== "/auth/login") window.dispatchEvent(new Event("studio:session-expired"));
    throw new ApiError(body?.error?.message ?? "The request could not be completed. Please try again.", response.status, body?.error?.code ?? "request_failed");
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
