/**
 * API Client — fetches from pi-finance-api when NEXT_PUBLIC_PI_FINANCE_API_BASE_URL
 * is set. Falls back to undefined (caller uses mock data) when env is absent.
 *
 * Token priority: explicit token option > NEXT_PUBLIC_PI_FINANCE_API_DEVICE_TOKEN env > localStorage ("pi-finance:token")
 *
 * All env reads happen at call-time, allowing tests to use vi.stubEnv.
 */

const PRODUCTION_PWA_HOST = "pi-finance-pwa.walissonead.workers.dev";
const PRODUCTION_API_BASE_URL = "https://api.synkroo.com.br";

function baseUrl(): string | undefined {
  const configured = process.env.NEXT_PUBLIC_PI_FINANCE_API_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined" && window.location.hostname === PRODUCTION_PWA_HOST) {
    return PRODUCTION_API_BASE_URL;
  }

  return undefined;
}

export function isApiConfigured(): boolean {
  return baseUrl() !== undefined;
}

/** Returns the auth token from env or localStorage (safe for client-side only) */
export function getAuthToken(): string | undefined {
  const envToken = process.env.NEXT_PUBLIC_PI_FINANCE_API_DEVICE_TOKEN;
  if (envToken) return envToken;
  try {
    return localStorage.getItem("pi-finance:token") ?? undefined;
  } catch {
    return undefined;
  }
}

export interface ApiClientOptions extends RequestInit {
  /** X-Device-Token header override (takes precedence over env) */
  token?: string;
  /** X-Idempotency-Key header */
  idempotencyKey?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  options: ApiClientOptions = {},
): Promise<T> {
  const { headers: optsHeaders, token, idempotencyKey, ...rest } = options;
  const resolvedToken = token ?? getAuthToken();

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(resolvedToken ? { "x-device-token": resolvedToken } : {}),
    ...((optsHeaders as Record<string, string>) ?? {}),
  };

  if (idempotencyKey) {
    requestHeaders["idempotency-key"] = idempotencyKey;
  }

  const res = await fetch(`${baseUrl() ?? ""}${path}`, {
    ...rest,
    headers: requestHeaders,
  });

  if (res.status === 401) {
    let body: Record<string, unknown> = {};
    try { body = await res.json(); } catch { /* noop */ }
    throw new ApiError(
      401,
      (body.code as string) ?? "auth.error",
      (body.message as string) ?? "Token inválido",
    );
  }

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let body: Record<string, unknown> = {};
    try { body = await res.json(); } catch { /* noop */ }
    throw new ApiError(
      res.status,
      (body.code as string) ?? "error",
      (body.message as string) ?? `HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

/** Convenience: GET with explicit token */
export function apiGet<T>(path: string, token: string): Promise<T> {
  return apiFetch<T>(path, { token });
}

/** Convenience: POST with optional token */
export function apiPost<T>(
  path: string,
  token: string | null,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    token: token ?? undefined,
    idempotencyKey,
  });
}
