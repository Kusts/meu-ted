import { apiFetch } from "./client";
import {
  emptyResponseSchema,
  workspaceInviteAcceptanceSchema,
  workspaceInviteSchema,
  workspaceListSchema,
  workspaceMemberListSchema,
  workspaceSchema,
} from "./schemas";

export type Workspace = {
  id: string;
  name: string;
  kind: "personal" | "shared";
  role: "owner" | "member";
  status: "active" | "archived";
};

export type WorkspaceMember = {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "member";
};

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const response = await apiFetch<{ items: Workspace[] }>("/workspaces", { responseSchema: workspaceListSchema });
  return response.items;
}

export async function createWorkspace(input: { name: string; kind: "personal" | "shared" }): Promise<Workspace> {
  return apiFetch<Workspace>("/workspaces", {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey: createIdempotencyKey(),
    responseSchema: workspaceSchema,
  });
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<Workspace> {
  return apiFetch<Workspace>(`/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name: name.trim() }),
    idempotencyKey: createIdempotencyKey(),
    responseSchema: workspaceSchema,
  });
}

export async function archiveWorkspace(workspaceId: string): Promise<Workspace> {
  return updateWorkspaceStatus(workspaceId, "archive");
}

export async function restoreWorkspace(workspaceId: string): Promise<Workspace> {
  return updateWorkspaceStatus(workspaceId, "restore");
}

async function updateWorkspaceStatus(workspaceId: string, action: "archive" | "restore"): Promise<Workspace> {
  return apiFetch<Workspace>(`/workspaces/${encodeURIComponent(workspaceId)}/${action}`, {
    method: "POST",
    idempotencyKey: createIdempotencyKey(),
    responseSchema: workspaceSchema,
  });
}

export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const response = await apiFetch<{ items: WorkspaceMember[] }>(`/workspaces/${encodeURIComponent(workspaceId)}/members`, {
    responseSchema: workspaceMemberListSchema,
  });
  return response.items;
}

export async function createWorkspaceInvite(workspaceId: string, email: string, expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)): Promise<{ inviteId: string; email: string; expiresAt: string }> {
  return apiFetch<{ inviteId: string; email: string; expiresAt: string }>("/auth/invites", {
    method: "POST",
    body: JSON.stringify({
      householdId: workspaceId,
      email: email.trim(),
      role: "member",
      expiresAt: expiresAt.toISOString(),
    }),
    idempotencyKey: createIdempotencyKey(),
    responseSchema: workspaceInviteSchema,
  });
}

export async function acceptWorkspaceInvite(token: string): Promise<{ inviteId: string; membership: { userId: string; householdId: string; role: "owner" | "member" } }> {
  return apiFetch<{ inviteId: string; membership: { userId: string; householdId: string; role: "owner" | "member" } }>("/auth/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
    idempotencyKey: createIdempotencyKey(),
    responseSchema: workspaceInviteAcceptanceSchema,
  });
}

export async function removeWorkspaceMember(workspaceId: string, memberUserId: string): Promise<void> {
  return apiFetch<void>(`/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberUserId)}`, {
    method: "DELETE",
    idempotencyKey: createIdempotencyKey(),
    responseSchema: emptyResponseSchema,
  });
}

export async function leaveWorkspace(workspaceId: string): Promise<void> {
  return apiFetch<void>(`/workspaces/${encodeURIComponent(workspaceId)}/leave`, {
    method: "POST",
    idempotencyKey: createIdempotencyKey(),
    responseSchema: emptyResponseSchema,
  });
}

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
