/**
 * Typed fetch wrapper for the Food Bot API.
 * Attaches X-Telegram-Init-Data on every request.
 * In dev mode (NEXT_PUBLIC_DEV_MODE=true) the header is sent empty — the
 * backend DEV_BYPASS_AUTH flag accepts that and injects a dev admin identity.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Singleton initData set by AuthContext after Telegram SDK is ready.
let _initData = "";
export function setInitData(data: string) { _initData = data; }
export function getInitData() { return _initData; }

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
    "X-Telegram-Init-Data": _initData,
  };

  const resp = await fetch(`${API_BASE}/api${path}`, { ...options, headers });

  if (resp.status === 204) return null as T;

  const body = await resp.json().catch(() => null);

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    if (body?.detail) {
      if (typeof body.detail === "string") {
        msg = body.detail;
      } else if (Array.isArray(body.detail)) {
        msg = body.detail.map((e: { msg?: string }) => e?.msg ?? JSON.stringify(e)).join("; ");
      } else {
        msg = JSON.stringify(body.detail);
      }
    }
    throw new ApiError(msg, resp.status);
  }

  return body as T;
}

// Convenience wrappers
export const api = {
  get:    <T>(path: string) => apiRequest<T>(path, { method: "GET" }),
  post:   <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};
