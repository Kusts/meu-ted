"use client";

import { useState, type FormEvent } from "react";
import BottomSheet from "@/components/BottomSheet";
import { useWorkspaceSafe } from "@/lib/auth/workspace-context";

export default function WorkspaceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const workspace = useWorkspaceSafe();
  if (!workspace) return null;
  const {
    workspaces,
    activeWorkspace,
    members,
    membersLoading,
    selectWorkspace,
    createWorkspace,
    inviteMember,
    acceptInvite,
    removeMember,
    leave,
  } = workspace;
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, success?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      success?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    void run(() => inviteMember(inviteEmail), () => setInviteEmail(""));
  }

  function submitAccept(event: FormEvent) {
    event.preventDefault();
    if (inviteToken.trim().length !== 64) {
      setError("Cole o token completo do convite (64 caracteres).");
      return;
    }
    void run(() => acceptInvite(inviteToken), () => setInviteToken(""));
  }

  function submitWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!workspaceName.trim()) return;
    void run(() => createWorkspace({ name: workspaceName.trim(), kind: "shared" }), () => setWorkspaceName(""));
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Workspaces">
      <div className="space-y-5">
        <section aria-labelledby="workspace-selection-heading" className="space-y-2">
          <h2 id="workspace-selection-heading" className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Workspace ativo</h2>
          <div className="grid gap-2">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => selectWorkspace(workspace.id)}
                aria-pressed={workspace.id === activeWorkspace?.id}
                className={`flex items-center justify-between rounded-[13px] border px-3.5 py-3 text-left ${workspace.id === activeWorkspace?.id ? "border-primary bg-primary/10" : "border-border bg-fill-light"}`}
              >
                <span>
                  <span className="block text-[14px] font-bold text-text-primary">{workspace.name}</span>
                  <span className="text-[11px] text-text-muted">{workspace.kind === "personal" ? "Pessoal" : "Compartilhado"}</span>
                </span>
                <span className="text-[11px] font-semibold text-text-muted">{workspace.role === "owner" ? "Owner" : "Membro"}</span>
              </button>
            ))}
          </div>
          <form onSubmit={submitWorkspace} className="flex gap-2 pt-1">
            <label className="sr-only" htmlFor="workspace-name">Nome do novo workspace</label>
            <input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Novo workspace" className="min-w-0 flex-1 rounded-[12px] border border-border bg-transparent px-3 py-2.5 text-[13px] text-text-primary" />
            <button type="submit" disabled={busy || !workspaceName.trim()} className="rounded-[12px] bg-primary px-3 text-[12px] font-bold text-white disabled:opacity-50">Criar</button>
          </form>
        </section>

        <section aria-labelledby="workspace-members-heading" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="workspace-members-heading" className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Membros</h2>
            {membersLoading && <span className="text-[11px] text-text-muted">Carregando…</span>}
          </div>
          <div className="divide-y divide-border rounded-[13px] bg-fill-light px-3.5">
            {members.map((member) => (
              <div key={member.userId} className="flex items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-text-primary">{member.name}</p>
                  <p className="truncate text-[11px] text-text-muted">{member.email} · {member.role === "owner" ? "Owner" : "Membro"}</p>
                </div>
                {activeWorkspace?.role === "owner" && member.role !== "owner" && (
                  <button type="button" aria-label={`Remover ${member.name}`} onClick={() => void run(() => removeMember(member.userId))} className="rounded-lg px-2 py-1 text-[11px] font-bold text-danger">Remover</button>
                )}
              </div>
            ))}
            {!membersLoading && members.length === 0 && <p className="py-3 text-[12px] text-text-muted">Nenhum membro encontrado.</p>}
          </div>
        </section>

        {activeWorkspace?.kind === "shared" && activeWorkspace.role === "owner" && (
          <form onSubmit={submitInvite} className="space-y-2 rounded-[13px] bg-fill-light p-3.5">
            <label htmlFor="invite-email" className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Convidar membro</label>
            <div className="flex gap-2">
              <input id="invite-email" aria-label="Email do convidado" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="email@exemplo.com" required className="min-w-0 flex-1 rounded-[12px] border border-border bg-transparent px-3 py-2.5 text-[13px] text-text-primary" />
              <button type="submit" disabled={busy || !inviteEmail.trim()} className="rounded-[12px] bg-primary px-3 text-[12px] font-bold text-white disabled:opacity-50">Convidar membro</button>
            </div>
          </form>
        )}

        <form onSubmit={submitAccept} className="space-y-2 rounded-[13px] border border-border p-3.5">
          <label htmlFor="invite-token" className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Aceitar convite</label>
          <div className="flex gap-2">
            <input id="invite-token" value={inviteToken} onChange={(event) => setInviteToken(event.target.value)} placeholder="Token do convite" className="min-w-0 flex-1 rounded-[12px] border border-border bg-transparent px-3 py-2.5 font-mono text-[11px] text-text-primary" />
            <button type="submit" disabled={busy || inviteToken.trim().length !== 64} className="rounded-[12px] border border-primary px-3 text-[12px] font-bold text-primary disabled:opacity-50">Aceitar</button>
          </div>
        </form>

        {activeWorkspace?.kind === "shared" && (
          <button type="button" disabled={busy} onClick={() => void run(leave, onClose)} className="w-full rounded-[13px] border border-danger/30 px-3 py-3 text-[13px] font-bold text-danger disabled:opacity-50">Sair deste workspace</button>
        )}
        {error && <p role="alert" className="rounded-[10px] bg-danger-tint px-3 py-2 text-[12px] font-semibold text-danger">{error}</p>}
      </div>
    </BottomSheet>
  );
}
