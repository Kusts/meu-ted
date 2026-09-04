"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isApiConfigured, clearActiveWorkspaceId, setActiveWorkspaceId, ApiError } from "@/lib/api/client";
import { clearSensitiveSession } from "@/lib/session";
import { closeAllSockets } from "./socket-registry";
import {
  acceptOwnershipTransfer,
  acceptWorkspaceInvite,
  createOwnershipTransfer,
  createWorkspace as createWorkspaceRequest,
  createWorkspaceInvite,
  fetchOwnershipTransfers,
  fetchPendingInvites,
  fetchWorkspaceMembers,
  fetchWorkspaces,
  leaveWorkspace,
  removeWorkspaceMember,
  renameWorkspace as renameWorkspaceRequest,
  resendWorkspaceInvite,
  revokeWorkspaceInvite,
  archiveWorkspace as archiveWorkspaceRequest,
  restoreWorkspace as restoreWorkspaceRequest,
  type OwnershipTransfer,
  type PendingInvite,
  type Workspace,
  type WorkspaceMember,
} from "@/lib/api/workspaces";

function isAuthFailure(cause: unknown): boolean {
  if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
    return true;
  }
  if (
    cause &&
    typeof cause === "object" &&
    "status" in cause &&
    ((cause as { status: unknown }).status === 401 || (cause as { status: unknown }).status === 403)
  ) {
    return true;
  }
  if (cause instanceof Error) {
    const msg = cause.message.toLowerCase();
    return (
      msg.includes("token inválido") ||
      msg.includes("token invalido") ||
      msg.includes("unauthorized") ||
      msg.includes("não autorizado") ||
      msg.includes("nao autorizado") ||
      msg.includes("forbidden") ||
      msg.includes("sessão expirada") ||
      msg.includes("sessao expirada") ||
      msg.includes("auth.") ||
      msg.includes("401") ||
      msg.includes("403")
    );
  }
  return false;
}

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
  pendingInvites: PendingInvite[];
  ownershipTransfers: OwnershipTransfer[];
  loading: boolean;
  membersLoading: boolean;
  pendingInvitesLoading: boolean;
  ownershipTransfersLoading: boolean;
  error: string | null;
  isAuthError?: boolean;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshPendingInvites: () => Promise<void>;
  refreshOwnershipTransfers: () => Promise<void>;
  createWorkspace: (input: { name: string; kind: "personal" | "shared" }) => Promise<Workspace>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  archiveWorkspace: (workspaceId: string) => Promise<void>;
  restoreWorkspace: (workspaceId: string) => Promise<void>;
  inviteMember: (email: string) => Promise<void>;
  resendInvite: (inviteId: string) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  acceptInvite: (token: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  transferOwnership: (toUserId: string) => Promise<void>;
  acceptTransfer: (transferId: string) => Promise<void>;
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
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [ownershipTransfers, setOwnershipTransfers] = useState<OwnershipTransfer[]>([]);
  const [loading, setLoading] = useState(() => isApiConfigured());
  const [membersLoading, setMembersLoading] = useState(false);
  const [pendingInvitesLoading, setPendingInvitesLoading] = useState(false);
  const [ownershipTransfersLoading, setOwnershipTransfersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);

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
      setIsAuthError(false);
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
      setIsAuthError(isAuthFailure(cause));
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
        setError(null);
        setIsAuthError(false);
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
          setIsAuthError(isAuthFailure(cause));
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

  const refreshPendingInvites = useCallback(async () => {
    if (!activeWorkspace || !isApiConfigured() || activeWorkspace.kind !== "shared" || activeWorkspace.role !== "owner") {
      setPendingInvites([]);
      return;
    }
    setPendingInvitesLoading(true);
    try {
      const invites = await fetchPendingInvites(activeWorkspace.id);
      setPendingInvites(invites);
    } catch {
      // Do not overwrite on transient errors
    } finally {
      setPendingInvitesLoading(false);
    }
  }, [activeWorkspace]);

  const refreshOwnershipTransfers = useCallback(async () => {
    if (!activeWorkspace || !isApiConfigured() || activeWorkspace.kind !== "shared") {
      setOwnershipTransfers([]);
      return;
    }
    setOwnershipTransfersLoading(true);
    try {
      const transfers = await fetchOwnershipTransfers(activeWorkspace.id);
      setOwnershipTransfers(transfers);
    } catch {
      // 403 or non-authorized fallback
      setOwnershipTransfers([]);
    } finally {
      setOwnershipTransfersLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    let cancelled = false;
    async function loadDetails() {
      if (!activeWorkspace || !isApiConfigured()) {
        if (!cancelled) {
          setMembers([]);
          setPendingInvites([]);
          setOwnershipTransfers([]);
        }
        return;
      }
      if (activeWorkspace.kind === "shared") {
        try {
          const nextMembers = await fetchWorkspaceMembers(activeWorkspace.id);
          if (!cancelled) setMembers(nextMembers);
        } catch {}

        if (activeWorkspace.role === "owner") {
          try {
            const nextInvites = await fetchPendingInvites(activeWorkspace.id);
            if (!cancelled) setPendingInvites(nextInvites);
          } catch {}
        } else {
          if (!cancelled) setPendingInvites([]);
        }

        try {
          const nextTransfers = await fetchOwnershipTransfers(activeWorkspace.id);
          if (!cancelled) setOwnershipTransfers(nextTransfers);
        } catch {
          if (!cancelled) setOwnershipTransfers([]);
        }
      } else {
        if (!cancelled) {
          setMembers([]);
          setPendingInvites([]);
          setOwnershipTransfers([]);
        }
      }
    }
    void loadDetails();
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
      clearActiveWorkspaceId();
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
    await refreshPendingInvites();
  }, [activeWorkspace, refreshPendingInvites]);

  const resendInvite = useCallback(async (inviteId: string) => {
    if (!activeWorkspace) throw new Error("Selecione um workspace compartilhado.");
    await resendWorkspaceInvite(activeWorkspace.id, inviteId);
    await refreshPendingInvites();
  }, [activeWorkspace, refreshPendingInvites]);

  const revokeInvite = useCallback(async (inviteId: string) => {
    if (!activeWorkspace) throw new Error("Selecione um workspace compartilhado.");
    await revokeWorkspaceInvite(activeWorkspace.id, inviteId);
    await refreshPendingInvites();
  }, [activeWorkspace, refreshPendingInvites]);

  const acceptInvite = useCallback(async (token: string) => {
    await acceptWorkspaceInvite(token.trim());
    await refreshWorkspaces();
  }, [refreshWorkspaces]);

  const removeMember = useCallback(async (userId: string) => {
    if (!activeWorkspace) throw new Error("Selecione um workspace.");
    await removeWorkspaceMember(activeWorkspace.id, userId);
    await refreshMembers();
  }, [activeWorkspace, refreshMembers]);

  const transferOwnership = useCallback(async (toUserId: string) => {
    if (!activeWorkspace) throw new Error("Selecione um workspace.");
    await createOwnershipTransfer(activeWorkspace.id, toUserId);
    await refreshOwnershipTransfers();
  }, [activeWorkspace, refreshOwnershipTransfers]);

  const acceptTransfer = useCallback(async (transferId: string) => {
    if (!activeWorkspace) throw new Error("Selecione um workspace.");
    await acceptOwnershipTransfer(activeWorkspace.id, transferId);
    await refreshWorkspaces();
    await refreshMembers();
    await refreshOwnershipTransfers();
  }, [activeWorkspace, refreshMembers, refreshOwnershipTransfers, refreshWorkspaces]);

  const leave = useCallback(async () => {
    if (!activeWorkspace) throw new Error("Selecione um workspace.");
    await leaveWorkspace(activeWorkspace.id);
    await refreshWorkspaces();
  }, [activeWorkspace, refreshWorkspaces]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    workspaces,
    activeWorkspace,
    members,
    pendingInvites,
    ownershipTransfers,
    loading,
    membersLoading,
    pendingInvitesLoading,
    ownershipTransfersLoading,
    error,
    isAuthError,
    selectWorkspace,
    refreshWorkspaces,
    refreshMembers,
    refreshPendingInvites,
    refreshOwnershipTransfers,
    createWorkspace,
    renameWorkspace,
    archiveWorkspace,
    restoreWorkspace,
    inviteMember,
    resendInvite,
    revokeInvite,
    acceptInvite,
    removeMember,
    transferOwnership,
    acceptTransfer,
    leave,
  }), [workspaces, activeWorkspace, members, pendingInvites, ownershipTransfers, loading, membersLoading, pendingInvitesLoading, ownershipTransfersLoading, error, isAuthError, selectWorkspace, refreshWorkspaces, refreshMembers, refreshPendingInvites, refreshOwnershipTransfers, createWorkspace, renameWorkspace, archiveWorkspace, restoreWorkspace, inviteMember, resendInvite, revokeInvite, acceptInvite, removeMember, transferOwnership, acceptTransfer, leave]);

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
