import { apiFetch, apiGet } from "./client";

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
