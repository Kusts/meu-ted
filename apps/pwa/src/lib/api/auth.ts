import { apiFetch, apiGet } from "./client";
import { getSessionToken } from "@/lib/auth/token-store";

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

export async function fetchSession(): Promise<{ user: { id: string; email: string; name: string } | null }> {
  try {
    const headers: Record<string, string> = {};
    const token = getSessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await apiFetch<{ user: { id: string; email: string; name: string }; session: unknown }>("/auth/session", {
      method: "GET",
      headers,
    });
    return { user: res.user };
  } catch {
    return { user: null };
  }
}

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

export async function verifyDeviceToken(token: string): Promise<unknown> {
  return apiGet<unknown>("/auth/devices/me", token);
}
