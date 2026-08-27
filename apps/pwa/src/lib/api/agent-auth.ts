import { apiFetch } from "./client";

export type AgentConnectionTokenResponse = {
  token: string;
  expiresIn: number;
};

let cachedToken: {
  workspaceId: string;
  token: string;
  expiresAt: number;
} | null = null;

export const fetchAgentToken = async (
  workspaceId: string,
  forceFresh = false,
): Promise<{ token: string; expiresIn: number }> => {
  const tokenString = await fetchAgentConnectionToken(workspaceId, forceFresh);
  return { token: tokenString, expiresIn: 90 };
};

export const fetchAgentConnectionToken = async (
  workspaceId: string,
  forceFresh = false,
): Promise<string> => {
  const now = Date.now();
  if (!forceFresh && cachedToken && cachedToken.workspaceId === workspaceId && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  const response = await apiFetch<AgentConnectionTokenResponse>("/auth/agent-token", {
    method: "POST",
    headers: {
      "x-workspace-id": workspaceId,
    },
  });

  const ttlMs = Math.min((response.expiresIn ?? 120) * 1000, 90_000); // 90s cache TTL limit
  cachedToken = {
    workspaceId,
    token: response.token,
    expiresAt: now + ttlMs,
  };

  return response.token;
};

export const clearAgentConnectionTokenCache = (): void => {
  cachedToken = null;
};
