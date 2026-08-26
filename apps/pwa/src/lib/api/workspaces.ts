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
    responseSchema: workspaceInviteSchema,
  });
}

export async function acceptWorkspaceInvite(token: string): Promise<{ inviteId: string; membership: { userId: string; householdId: string; role: "owner" | "member" } }> {
  return apiFetch<{ inviteId: string; membership: { userId: string; householdId: string; role: "owner" | "member" } }>("/auth/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
    responseSchema: workspaceInviteAcceptanceSchema,
  });
}

export async function removeWorkspaceMember(workspaceId: string, memberUserId: string): Promise<void> {
  return apiFetch<void>(`/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberUserId)}`, {
    method: "DELETE",
    responseSchema: emptyResponseSchema,
  });
}

export async function leaveWorkspace(workspaceId: string): Promise<void> {
  return apiFetch<void>(`/workspaces/${encodeURIComponent(workspaceId)}/leave`, {
    method: "POST",
    responseSchema: emptyResponseSchema,
  });
}
