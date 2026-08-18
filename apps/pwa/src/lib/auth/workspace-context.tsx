"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clearActiveWorkspaceId, setActiveWorkspaceId } from "@/lib/api/client";
import { clearSensitiveSession } from "@/lib/session";
import { closeAllSockets } from "./socket-registry";
import {
  acceptWorkspaceInvite,
  createWorkspace as createWorkspaceRequest,
  createWorkspaceInvite,
  fetchWorkspaceMembers,
  fetchWorkspaces,
  leaveWorkspace,
  removeWorkspaceMember,
  type Workspace,
  type WorkspaceMember,
} from "@/lib/api/workspaces";

export interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  members: WorkspaceMember[];
  loading: boolean;
  membersLoading: boolean;
  error: string | null;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  createWorkspace: (input: { name: string; kind: "personal" | "shared" }) => Promise<Workspace>;
  inviteMember: (email: string) => Promise<void>;
  acceptInvite: (token: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  leave: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>();
  const activeWorkspaceIdRef = useRef<string | undefined>(undefined);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchWorkspaces();
      setWorkspaces(next);
      const current = activeWorkspaceIdRef.current;
      const selected = next.some((workspace) => workspace.id === current) ? current : next[0]?.id;
      if (current && selected !== current) {
        setLoading(true);
        closeAllSockets("workspace access revoked");
        await clearSensitiveSession({ clearV1Snapshot: true, clearProfile: true });
      }
      activeWorkspaceIdRef.current = selected;
      setActiveWorkspaceIdState(selected);
      if (selected) setActiveWorkspaceId(selected);
      else clearActiveWorkspaceId();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os workspaces.");
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refreshWorkspaces().catch(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
      clearActiveWorkspaceId();
    };
  }, [refreshWorkspaces]);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  const refreshMembers = useCallback(async () => {
    if (!activeWorkspace) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    try {
      setMembers(await fetchWorkspaceMembers(activeWorkspace.id));
    } finally {
      setMembersLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    void refreshMembers().catch(() => setMembers([]));
  }, [refreshMembers]);

  const selectWorkspace = useCallback(async (workspaceId: string) => {
    if (!workspaces.some((workspace) => workspace.id === workspaceId)) return;
    const current = activeWorkspaceIdRef.current;
    if (current === workspaceId) return;
    setLoading(true);
    if (current) {
      closeAllSockets("workspace access revoked");
      await clearSensitiveSession({ clearV1Snapshot: true, clearProfile: true });
    }
    activeWorkspaceIdRef.current = workspaceId;
    setActiveWorkspaceIdState(workspaceId);
    setActiveWorkspaceId(workspaceId);
    setLoading(false);
  }, [workspaces]);

  const createWorkspace = useCallback(async (input: { name: string; kind: "personal" | "shared" }) => {
    const created = await createWorkspaceRequest(input);
    await refreshWorkspaces();
    await selectWorkspace(created.id);
    return created;
  }, [refreshWorkspaces, selectWorkspace]);

  const inviteMember = useCallback(async (email: string) => {
    if (!activeWorkspace) throw new Error("Selecione um workspace compartilhado.");
    await createWorkspaceInvite(activeWorkspace.id, email);
  }, [activeWorkspace]);

  const acceptInvite = useCallback(async (token: string) => {
    await acceptWorkspaceInvite(token.trim());
    await refreshWorkspaces();
  }, [refreshWorkspaces]);

  const removeMember = useCallback(async (userId: string) => {
    if (!activeWorkspace) throw new Error("Selecione um workspace.");
    await removeWorkspaceMember(activeWorkspace.id, userId);
    await refreshMembers();
  }, [activeWorkspace, refreshMembers]);

  const leave = useCallback(async () => {
    if (!activeWorkspace) throw new Error("Selecione um workspace.");
    await leaveWorkspace(activeWorkspace.id);
    await refreshWorkspaces();
  }, [activeWorkspace, refreshWorkspaces]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    workspaces,
    activeWorkspace,
    members,
    loading,
    membersLoading,
    error,
    selectWorkspace,
    refreshWorkspaces,
    refreshMembers,
    createWorkspace,
    inviteMember,
    acceptInvite,
    removeMember,
    leave,
  }), [workspaces, activeWorkspace, members, loading, membersLoading, error, selectWorkspace, refreshWorkspaces, refreshMembers, createWorkspace, inviteMember, acceptInvite, removeMember, leave]);

  if (loading) return <main className="flex h-dvh items-center justify-center text-text-secondary">Carregando workspaces…</main>;
  return (
    <WorkspaceContext.Provider value={value}>
      <Fragment key={activeWorkspaceId ?? "no-workspace"}>{children}</Fragment>
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}

export function useWorkspaceSafe(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
