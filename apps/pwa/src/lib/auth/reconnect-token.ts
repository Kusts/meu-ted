import { apiFetch } from "@/lib/api/client";
import { isReconnectTokenValid, openManagedSocket, registerReconnectToken } from "./socket-registry";
import { z } from "zod";

const reconnectTokenSchema = z.object({ token: z.string().min(1), expiresInSeconds: z.number().int().positive() });

const reconnectResponseSchema = z.object({ sessionId: z.string().min(1) });

export async function requestReconnectToken(): Promise<string> {
  const response = await apiFetch<{ token: string; expiresInSeconds: number }>("/auth/reconnect-token", {
    method: "POST",
    responseSchema: reconnectTokenSchema,
  });
  return registerReconnectToken(response.token);
}

export async function reconnectWithToken(token: string, socketUrl?: string): Promise<{ sessionId: string; socket?: WebSocket }> {
  if (!isReconnectTokenValid(token)) throw new Error("reconnect token has been invalidated");
  const response = await apiFetch<{ sessionId: string }>("/auth/reconnect", {
    method: "POST",
    body: JSON.stringify({ token }),
    headers: { "content-type": "application/json" },
    responseSchema: reconnectResponseSchema,
  });
  return socketUrl
    ? { ...response, socket: openManagedSocket(`${socketUrl}?reconnect_token=${encodeURIComponent(token)}`) }
    : response;
}

/** Production reconnect consumer: obtains a fresh delegated token, validates it server-side, then opens a managed socket. */
export async function connectAuthenticatedSocket(socketUrl: string): Promise<{ sessionId: string; socket: WebSocket }> {
  const token = await requestReconnectToken();
  return reconnectWithToken(token, socketUrl) as Promise<{ sessionId: string; socket: WebSocket }>;
}
