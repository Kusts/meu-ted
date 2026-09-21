import { apiFetch, apiGet, ApiError } from "./client";
import { getSessionToken } from "@/lib/auth/token-store";
import { classifyAuthSignal } from "@/lib/auth/auth-state-machine";

export type VerifyAccountInviteResult = {
  email: string;
  expiresAt: string;
};

export type PendingInviteSummary = {
  id: string;
  householdId: string;
  email: string;
  role: "owner" | "member";
  expiresAt: string;
  createdAt?: string;
};

export type PendingMeResult = {
  items: PendingInviteSummary[];
  total: number;
};

export type SignInEmailCredentials = {
  email: string;
  password: string;
};

export type SignInEmailResponse = {
  token?: string;
  user?: unknown;
  redirect?: boolean;
};

export type RegisterDeviceResponse = {
  token: string;
  deviceId: string;
  householdId: string;
};

export async function signInWithEmail(credentials: SignInEmailCredentials): Promise<SignInEmailResponse> {
  return apiFetch<SignInEmailResponse>("/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify(credentials),
    headers: { "Content-Type": "application/json" },
  });
}

export async function signUpWithEmail(input: { email: string; password: string; name: string }): Promise<SignInEmailResponse> {
  return apiFetch<SignInEmailResponse>("/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
  });
}

export async function verifyAccountInvite(token: string): Promise<VerifyAccountInviteResult> {
  return apiFetch<VerifyAccountInviteResult>("/auth/account-invites/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
    headers: { "Content-Type": "application/json" },
  });
}

export async function fetchPendingMe(): Promise<PendingMeResult> {
  const headers: Record<string, string> = {};
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return apiFetch<PendingMeResult>("/auth/invites/pending-me", {
    method: "GET",
    headers,
  });
}

export type SessionUser = { id: string; email: string; name: string };

/** Session probe signal (V4.1 Closure AUTH-04, INV-05). */
export type SessionProbeStatus = "authenticated" | "unauthenticated" | "unreachable";

export interface SessionProbeResult {
  user: SessionUser | null;
  /**
   * authenticated: 2xx with a user. unauthenticated: the server answered
   * "no session" (2xx without user, 401/403 → purge + login). unreachable:
   * the server never answered about the session (network/timeout/5xx →
   * NEVER logout, NEVER offline-unlock of an invalid session by itself).
   */
  status: SessionProbeStatus;
}

/**
 * Session probe (cookie-first: `credentials: "include"` in apiFetch, compat
 * bearer only as fallback). Distinguishes 2xx / 401+403 / unreachable via
 * the auth state machine — network errors are NOT collapsed into logout.
 */
export async function fetchSession(): Promise<SessionProbeResult> {
  try {
    const headers: Record<string, string> = {};
    const token = getSessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await apiFetch<{ user: SessionUser; session: unknown }>("/auth/session", {
      method: "GET",
      headers,
    });
    if (!res.user) return { user: null, status: "unauthenticated" };
    return { user: res.user, status: "authenticated" };
  } catch (e) {
    if (e instanceof ApiError) {
      const state = classifyAuthSignal({ kind: "http", status: e.status, code: e.code });
      return { user: null, status: state === "unauthenticated" ? "unauthenticated" : "unreachable" };
    }
    return { user: null, status: "unreachable" };
  }
}

/**
 * T2.5 (ADR-015 Opção C, session-first): scoped device flow — device
 * registration authenticates via the SESSION (cookie + compat bearer) and
 * intentionally carries NO x-device-token. A stale stored device token must
 * never leak into this call; apiFetch only attaches the device header on the
 * explicit `token` option, which this flow deliberately omits.
 */
export async function registerDeviceToken(sessionToken?: string): Promise<RegisterDeviceResponse> {
  return apiFetch<RegisterDeviceResponse>("/auth/devices/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify({ deviceName: "PWA Web Device" }),
  });
}

/**
 * T2.5 (ADR-015 Opção C, session-first): scoped device flow — the ONLY
 * normal-path caller that carries x-device-token, passed explicitly via the
 * `token` opt-in (boot gate verification). Rotation
 * (POST /auth/devices/rotate) follows the same pattern when wired: explicit
 * token, never the implicit store fallback (removed in T2.5).
 */
export async function verifyDeviceToken(token: string): Promise<unknown> {
  return apiGet<unknown>("/auth/devices/me", token);
}
