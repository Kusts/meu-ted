"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isApiConfigured, clearActiveWorkspaceId, setActiveWorkspaceId } from "@/lib/api/client";
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
  renameWorkspace as renameWorkspaceRequest,
  archiveWorkspace as archiveWorkspaceRequest,
  restoreWorkspace as restoreWorkspaceRequest,
  type Workspace,
  type WorkspaceMember,
} from "@/lib/api/workspaces";

const MOCK_DEFAULT_WORKSPACE: Workspace = {
  id: "mock-workspace",
  name: "Minhas Finanças",
  kind: "personal",
  role: "owner",
  status: "active",
};

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
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  archiveWorkspace: (workspaceId: string) => Promise<void>;
  restoreWorkspace: (workspaceId: string) => Promise<void>;
  inviteMember: (email: string) => Promise<void>;
  acceptInvite: (token: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  leave: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() =>
    isApiConfigured() ? [] : [MOCK_DEFAULT_WORKSPACE],
  );
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | undefined>(() =>
    isApiConfigured() ? undefined : MOCK_DEFAULT_WORKSPACE.id,
  );
  const activeWorkspaceIdRef = useRef<string | undefined>(
    isApiConfigured() ? undefined : MOCK_DEFAULT_WORKSPACE.id,
  );
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(() => isApiConfigured());
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    if (!isApiConfigured()) {
      setWorkspaces([MOCK_DEFAULT_WORKSPACE]);
      setActiveWorkspaceIdState(MOCK_DEFAULT_WORKSPACE.id);
      activeWorkspaceIdRef.current = MOCK_DEFAULT_WORKSPACE.id;
      setLoading(false);
      return;
    }
    try {
      const next = await fetchWorkspaces();
      setError(null);
      setWorkspaces(next);
      const current = activeWorkspaceIdRef.current;
       const selected = next.some((workspace) => workspace.id === current && workspace.status !== "archived")
         ? current
         : next.find((workspace) => workspace.status !== "archived")?.id;
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
    if (!isApiConfigured()) {
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const next = await fetchWorkspaces();
        if (cancelled) return;
        setWorkspaces(next);
        const current = activeWorkspaceIdRef.current;
         const selected = next.some((workspace) => workspace.id === current && workspace.status !== "archived")
           ? current
           : next.find((workspace) => workspace.status !== "archived")?.id;
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
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Não foi possível carregar os workspaces.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearActiveWorkspaceId();
    };
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  const refreshMembers = useCallback(async () => {
    if (!activeWorkspace || !isApiConfigured()) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    try {
      const nextMembers = await fetchWorkspaceMembers(activeWorkspace.id);
      setMembers(nextMembers);
    } catch (cause) {
      throw cause;
    } finally {
      setMembersLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspace || !isApiConfigured()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMembers([]);
      return () => {
        cancelled = true;
      };
    }
    async function loadMembers(workspaceId: string) {
      try {
        const nextMembers = await fetchWorkspaceMembers(workspaceId);
        if (!cancelled) setMembers(nextMembers);
      } catch {
        if (!cancelled) {
          // Do not overwrite members on transient errors
        }
      }
    }
    void loadMembers(activeWorkspace.id);
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace]);

  const selectWorkspace = useCallback(async (workspaceId: string) => {
    const nextWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!nextWorkspace || nextWorkspace.status === "archived") return;
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

  const renameWorkspace = useCallback(async (workspaceId: string, name: string) => {
    await renameWorkspaceRequest(workspaceId, name);
    await refreshWorkspaces();
  }, [refreshWorkspaces]);

  const archiveWorkspace = useCallback(async (workspaceId: string) => {
    await archiveWorkspaceRequest(workspaceId);
    await refreshWorkspaces();
  }, [refreshWorkspaces]);

  const restoreWorkspace = useCallback(async (workspaceId: string) => {
    await restoreWorkspaceRequest(workspaceId);
    await refreshWorkspaces();
  }, [refreshWorkspaces]);

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
    renameWorkspace,
    archiveWorkspace,
    restoreWorkspace,
    inviteMember,
    acceptInvite,
    removeMember,
    leave,
  }), [workspaces, activeWorkspace, members, loading, membersLoading, error, selectWorkspace, refreshWorkspaces, refreshMembers, createWorkspace, renameWorkspace, archiveWorkspace, restoreWorkspace, inviteMember, acceptInvite, removeMember, leave]);

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
