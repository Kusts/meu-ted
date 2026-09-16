/**
 * API Client — canonical browser transport is the same-origin proxy
 * `/api/backend` (ADR-011: browser → /api/backend, HttpOnly cookie session
 * via Set-Cookie passthrough, allowlisted headers, Origin check, upstream
 * timeout, `no-store` responses).
 *
 * `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL`, when explicitly set OFF the
 * production host, overrides the proxy — explicit dev/test escape hatch only
 * (ADR-011 "Decisão": compatibilidade transitória; T2.1/ADR-015 session-first
 * Option C). It is never a published production default: the production host
 * always uses the proxy, with or without the env set.
 *
 * Auth transport (ADR-011 compat window + ADR-015 Opção C, session-first):
 * the proxy forwards `cookie` (plus `authorization` when present) with
 * `credentials: "include"`, so same-origin requests authenticate via the
 * HttpOnly cookie and MUST NOT require localStorage tokens. The session
 * Bearer from localStorage remains as fallback for origins where the Secure
 * cookie is not persisted (localhost).
 *
 * T2.5 (ADR-015 Opção C): `x-device-token` is NEVER attached implicitly.
 * Normal calls (financial data, RPC, chat) authenticate via session
 * (cookie + compat bearer) and `X-Workspace-Id`; the device header travels
 * ONLY on explicitly scoped device flows (POST /auth/devices/register,
 * GET /auth/devices/me, rotation) via the explicit `token` option.
 *
 * TODO(ADR-011, review 2026-12-01): remove the localStorage session/device
 * fallback once the compat window closes — see ADR-011 "Decisão".
 *
 * All env reads happen at call-time, allowing tests to use vi.stubEnv.
 */

import { z, type ZodType } from "zod";
import { closeAllSockets } from "@/lib/auth/socket-registry";
import { CLIENT_EVENTS_STORAGE_KEY } from "@/lib/telemetry/client-events";
import {
  getSessionToken as getStoredSessionToken,
  getToken as getStoredDeviceToken,
} from "@/lib/auth/token-store";
import { setOfflineSubjectId } from "@/lib/auth/offline-subject";
import { noteLegacyAuthUsage } from "@/lib/auth/legacy-usage";

export const responseSchema = z
  .object({
    ok: z.boolean().optional(),
    data: z.unknown().optional(),
    error: z.unknown().optional(),
  })
  .refine(
    (obj) => obj.ok !== undefined || obj.data !== undefined || obj.error !== undefined,
    { message: "Invalid API response envelope" },
  );

export const PRODUCTION_PWA_HOST = "pi-finance-pwa.walissonead.workers.dev";
/** Canonical same-origin proxy base (ADR-011) — never a cross-origin default. */
const SAME_ORIGIN_BACKEND_PROXY = "/api/backend";

let activeWorkspaceId: string | undefined;

export function setActiveWorkspaceId(workspaceId: string | undefined): void {
  activeWorkspaceId = workspaceId;
  // T2.2 B4/D-V4-11: o id do workspace ativo (UUID opaco, não-credencial) é
  // persistido como offlineSubjectId no momento em que é definido após auth
  // válida — todo set passa por este choke point (workspace-context). Chave
  // dedicada, nunca IndexedDB de credencial. Best-effort, nunca quebra o fluxo.
  if (workspaceId !== undefined) {
    try {
      setOfflineSubjectId(workspaceId);
    } catch {
      /* noop */
    }
  }
}

export function clearActiveWorkspaceId(): void {
  activeWorkspaceId = undefined;
}
function baseUrl(): string | undefined {
  // T2.1 (ADR-015 session-first, Option C): the production host always uses
  // the same-origin proxy so the HttpOnly session cookie reaches the API.
  // The explicit env below is a dev/test-only escape hatch and is ignored
  // in production.
  if (typeof window !== "undefined" && window.location.hostname === PRODUCTION_PWA_HOST) {
    return SAME_ORIGIN_BACKEND_PROXY;
  }

  const configured = process.env.NEXT_PUBLIC_PI_FINANCE_API_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  return undefined;
}

export function isApiConfigured(): boolean {
  return baseUrl() !== undefined;
}

/**
 * Returns the session token from the token-store (única abstração, T2.2 B2).
 * ADR-011 compat fallback: the same-origin proxy authenticates via the
 * HttpOnly cookie first — this Bearer is only a fallback for origins where
 * the Secure cookie is not persisted. See the TODO(ADR-011) in the header.
 * T2.3 B3.5: com NEXT_PUBLIC_LEGACY_BEARER_COMPAT=off a token-store retorna
 * null (leitura removida) e nenhum Authorization de sessão é anexado.
 */
export function getSessionToken(): string | undefined {
  try {
    return getStoredSessionToken() ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns the auth token from the token-store (única abstração, T2.2 B2).
 * ADR-011 compat fallback — see getSessionToken / header TODO(ADR-011).
 */
export function getAuthToken(): string | undefined {
  try {
    return getStoredDeviceToken() ?? undefined;
  } catch {
    return undefined;
  }
}

export const DEFAULT_API_TIMEOUT_MS = 15_000;

export interface ApiClientOptions extends RequestInit {
  /**
   * X-Device-Token header override — explicit opt-in ONLY for scoped device
   * flows (registration, verification, rotation, /auth/devices/*).
   * T2.5 (ADR-015 Opção C): apiFetch NEVER falls back to the device token
   * store implicitly; normal calls omit the header entirely.
   */
  token?: string;
  /** X-Idempotency-Key header */
  idempotencyKey?: string;
  /** Optional runtime response validation for protected API boundaries. */
  responseSchema?: ZodType<unknown>;
  /** Request timeout in milliseconds. Set to 0 to disable. Defaults to 15000ms. */
  timeoutMs?: number;
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

// ── Central 401 handling ─────────────────────────────────────────────────────
// Any 401 from the authoritative API (socket close + window event) lets every
// consumer react to session expiry without each caller handling 401 itself.

/**
 * Fired on `window` whenever apiFetch receives a 401, so any part of the app
 * (e.g. session expiry in AppStateProvider) can react without importing the
 * client or handling 401 per call-site.
 */
export const UNAUTHORIZED_EVENT = "pi-finance:unauthorized";

// ── Telemetry flush on the authenticated cycle ─────────────────────────────
// Queued mic.error events (V4 T0.4.7, SPEC §24.7) flush on the next
// successful same-origin request — that success IS the authenticated cycle.
// Best-effort and non-blocking: the peek is a single localStorage read, the
// flush itself never rejects into the request path, and the /client-events
// request itself never re-triggers (no recursion). Dynamic import keeps the
// transport one-directional (client-events → client) with no static cycle.

function maybeFlushClientEvents(path: string): void {
  if (path.startsWith("/client-events")) return;
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(CLIENT_EVENTS_STORAGE_KEY);
    if (!raw || raw === "[]") return;
  } catch {
    return;
  }
  void import("@/lib/telemetry/client-events")
    .then((events) => events.flushQueuedClientEvents())
    .catch(() => {
      /* queue stays durable for the next cycle */
    });
}

export async function apiFetch<T>(
  path: string,
  options: ApiClientOptions = {},
): Promise<T> {
  const {
    headers: optsHeaders,
    token,
    idempotencyKey,
    responseSchema,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    signal: callerSignal,
    ...rest
  } = options;
  // T2.5 (ADR-015 Opção C, session-first): the device token is attached
  // ONLY when passed explicitly (scoped device flows). Normal calls
  // authenticate via the cookie (+ compat session bearer) and MUST NOT
  // carry x-device-token, even when one sits in localStorage.
  const resolvedToken = token;
  const sessionToken = getSessionToken();

  // ADR-011: cookie session (credentials: "include" below) is primary on the
  // same-origin proxy path; localStorage headers are compat fallback only and
  // are omitted entirely when absent — the proxy MUST NOT require them.
  // T2.2: cada anexo de fallback conta na telemetria local (só contadores).
  // T2.5: o canal "device" agora conta só anexos explícitos de fluxos
  // escopados — o attach universal foi removido (ADR-015 Opção C).
  if (sessionToken) noteLegacyAuthUsage("session");
  if (resolvedToken) noteLegacyAuthUsage("device");
  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(rest.body ? { "Content-Type": "application/json" } : {}),
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    ...(resolvedToken ? { "x-device-token": resolvedToken } : {}),
    ...(activeWorkspaceId ? { "X-Workspace-Id": activeWorkspaceId } : {}),
    ...((optsHeaders as Record<string, string>) ?? {}),
  };

  if (idempotencyKey) {
    requestHeaders["idempotency-key"] = idempotencyKey;
  }

  const controller = new AbortController();
  let callerAbortHandler: (() => void) | undefined;
  if (callerSignal) {
    callerAbortHandler = () => controller.abort();
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", callerAbortHandler, { once: true });
  }

  const request = async (): Promise<T> => {
    const res = await fetch(`${baseUrl() ?? ""}${path}`, {
      ...rest,
      signal: controller.signal,
      credentials: "include",
      headers: requestHeaders,
    });

    if (res.status === 401) {
      let body: Record<string, unknown> = {};
      try { body = await res.json(); } catch { /* noop */ }
      closeAllSockets("session expired");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
      throw new ApiError(
        401,
        (body.code as string) ?? "auth.error",
        (body.message as string) ?? "Token inválido",
      );
    }

    if (res.status === 204) {
      maybeFlushClientEvents(path);
      return undefined as T;
    }

    if (!res.ok) {
      let body: Record<string, unknown> = {};
      try { body = await res.json(); } catch { /* noop */ }
      throw new ApiError(
        res.status,
        (body.code as string) ?? "error",
        (body.message as string) ?? `HTTP ${res.status}`,
      );
    }

    const payload: unknown = await res.json();
    maybeFlushClientEvents(path);
    return (responseSchema ? responseSchema.parse(payload) : payload) as T;
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    if (timeoutMs <= 0) return await request();
    return await new Promise<T>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new ApiError(408, "network.timeout", "Tempo limite de conexão excedido."));
      }, timeoutMs);
      void request().then(resolve, reject);
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (callerSignal && callerAbortHandler) {
      callerSignal.removeEventListener("abort", callerAbortHandler);
    }
  }
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
