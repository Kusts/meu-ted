"use client";

import { useState, type FormEvent } from "react";
import { Archive, Check, FolderKanban, Pencil, Plus, RotateCcw, Users, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatusBar from "@/components/StatusBar";
import { Button } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import { useWorkspace } from "@/lib/auth/workspace-context";
import type { Workspace } from "@/lib/api/workspaces";

type WorkspaceKind = Workspace["kind"];

const kindLabels: Record<WorkspaceKind, string> = {
  personal: "Pessoal",
  shared: "Compartilhado",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join("") || "W").toUpperCase();
}

function workspaceColor(workspace: Workspace): string {
  if (workspace.kind === "personal") return "#0E8C5A";
  let hash = 0;
  for (const character of workspace.name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return ["#7A5AF8", "#D97706", "#2563EB", "#C2415D"][hash % 4]!;
}

export default function WorkspaceManagerPage() {
  const {
    workspaces,
    activeWorkspace,
    members,
    loading,
    error,
    selectWorkspace,
    refreshWorkspaces,
    createWorkspace,
    renameWorkspace,
    archiveWorkspace,
    restoreWorkspace,
  } = useWorkspace();
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<WorkspaceKind>("shared");
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [editingName, setEditingName] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Workspace | null>(null);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const active = workspaces.filter((workspace) => workspace.status !== "archived");
  const archived = workspaces.filter((workspace) => workspace.status === "archived");
  const activeMembers = activeWorkspace?.kind === "shared" ? members.length : 0;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setFormBusy(true);
    setActionError(null);
    try {
      await createWorkspace({ name, kind: newKind });
      setNewName("");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Não foi possível criar o workspace.");
    } finally {
      setFormBusy(false);
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingWorkspace || !editingName.trim()) return;
    setBusyWorkspaceId(editingWorkspace.id);
    setActionError(null);
    try {
      await renameWorkspace(editingWorkspace.id, editingName.trim());
      setEditingWorkspace(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Não foi possível renomear o workspace.");
    } finally {
      setBusyWorkspaceId(null);
    }
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setBusyWorkspaceId(archiveTarget.id);
    setActionError(null);
    try {
      await archiveWorkspace(archiveTarget.id);
      setArchiveTarget(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Não foi possível arquivar o workspace.");
    } finally {
      setBusyWorkspaceId(null);
    }
  }

  async function handleRestore(workspace: Workspace) {
    setBusyWorkspaceId(workspace.id);
    setActionError(null);
    try {
      await restoreWorkspace(workspace.id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Não foi possível restaurar o workspace.");
    } finally {
      setBusyWorkspaceId(null);
    }
  }

  function renderWorkspaceCard(workspace: Workspace) {
    const isActive = workspace.id === activeWorkspace?.id;
    const isArchived = workspace.status === "archived";
    const canManage = workspace.role === "owner";
    const busy = busyWorkspaceId === workspace.id;

    return (
      <article
        key={workspace.id}
        className={`group relative overflow-hidden rounded-[20px] border p-4 transition-all ${
          isArchived
            ? "border-border-subtle bg-surface-2/55 opacity-80"
            : isActive
              ? "border-primary/40 bg-surface-1 shadow-elevated"
              : "border-border-subtle bg-surface-1 shadow-card hover:border-border-medium"
        }`}
        data-status={workspace.status}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] text-sm font-extrabold text-white shadow-sm"
            style={{ background: workspaceColor(workspace) }}
            aria-hidden="true"
          >
            {initials(workspace.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[15px] font-extrabold text-text-primary">{workspace.name}</h3>
              {isActive && (
                <span className="inline-flex flex-none items-center gap-1 rounded-full bg-primary-tint px-2 py-0.5 text-[10px] font-bold text-primary">
                  <Check size={11} strokeWidth={2.8} /> Ativo
                </span>
              )}
            </div>
            <p className="mt-1 text-[12px] font-medium text-text-muted">
              {kindLabels[workspace.kind]} · {workspace.role === "owner" ? "Owner" : "Membro"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <span className={`text-[11px] font-bold ${isArchived ? "text-text-muted" : "text-primary"}`}>
            {isArchived ? "Arquivado" : workspace.kind === "shared" && isActive ? `${members.length} membro${members.length === 1 ? "" : "s"}` : "Pronto para usar"}
          </span>
          <div className="flex items-center gap-1.5">
            {!isArchived && !isActive && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Usar ${workspace.name}`}
                onClick={() => void selectWorkspace(workspace.id)}
              >
                Usar
              </Button>
            )}
            {canManage && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Renomear ${workspace.name}`}
                  onClick={() => {
                    setEditingWorkspace(workspace);
                    setEditingName(workspace.name);
                    setActionError(null);
                  }}
                  disabled={busy}
                >
                  <Pencil size={15} />
                </Button>
                {isArchived ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Restaurar ${workspace.name}`}
                    onClick={() => void handleRestore(workspace)}
                    loading={busy}
                  >
                    <RotateCcw size={15} />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Arquivar ${workspace.name}`}
                    onClick={() => {
                      setArchiveTarget(workspace);
                      setActionError(null);
                    }}
                    disabled={busy}
                  >
                    <Archive size={15} />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg pb-[var(--tab-bar-height)]">
      <StatusBar />
      <PageHeader title="Workspaces" subtitle="Organize cada contexto sem misturar seus dados." />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-5 py-4 sm:px-8 lg:px-12">
        <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0d6b47] via-[#0e8c5a] to-[#1c9b72] p-5 text-white shadow-elevated sm:p-7" aria-labelledby="workspace-overview-heading">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[24px] border-white/10" />
          <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">Centro de ambientes</p>
              <h1 id="workspace-overview-heading" className="max-w-lg text-[25px] font-extrabold leading-tight tracking-tight">
                Um lugar certo para cada decisão financeira.
              </h1>
              <p className="mt-2 max-w-md text-[13px] font-medium leading-relaxed text-white/75">
                O ambiente ativo controla o contexto dos seus dados. Workspaces arquivados continuam disponíveis para restauração.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:min-w-[190px]">
              <div className="rounded-[16px] border border-white/15 bg-black/10 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Ativos</p>
                <p className="mt-1 text-[24px] font-extrabold">{active.length}</p>
              </div>
              <div className="rounded-[16px] border border-white/15 bg-black/10 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Arquivados</p>
                <p className="mt-1 text-[24px] font-extrabold">{archived.length}</p>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-[16px] border border-warning/30 bg-warning-tint px-4 py-3 text-[13px] font-semibold text-warning" role="alert">
            <span>{error}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => void refreshWorkspaces()}>Tentar novamente</Button>
          </div>
        )}
        {actionError && (
          <div className="flex items-center justify-between gap-3 rounded-[16px] border border-danger/20 bg-danger-tint px-4 py-3 text-[13px] font-semibold text-danger" role="alert">
            <span>{actionError}</span>
            <button type="button" aria-label="Fechar erro" onClick={() => setActionError(null)}><X size={16} /></button>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <section aria-labelledby="workspace-list-heading">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">Seus ambientes</p>
                <h2 id="workspace-list-heading" className="mt-1 text-[19px] font-extrabold tracking-tight text-text-primary">Workspaces disponíveis</h2>
              </div>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-text-muted">{workspaces.length} total</span>
            </div>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2" aria-label="Carregando workspaces">
                {[1, 2].map((item) => <div key={item} className="h-[142px] animate-pulse rounded-[20px] border border-border-subtle bg-surface-1" />)}
              </div>
            ) : workspaces.length === 0 ? (
              <Card className="min-h-[220px]">
                <EmptyState
                  icon={<FolderKanban size={24} />}
                  title="Nenhum workspace ainda"
                  description="Crie um ambiente para separar sua vida pessoal, família ou negócio."
                />
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">{workspaces.map(renderWorkspaceCard)}</div>
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-5" aria-label="Ações de workspace">
            <Card elevation={2}>
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary-tint text-primary"><Plus size={19} /></span>
                <div>
                  <h2 className="text-[16px] font-extrabold text-text-primary">Criar workspace</h2>
                  <p className="mt-1 text-[12px] leading-relaxed text-text-muted">Comece um contexto novo sem copiar seus lançamentos.</p>
                </div>
              </div>
              <form className="space-y-3" onSubmit={(event) => void handleCreate(event)}>
                <div>
                  <label htmlFor="workspace-name" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Nome</label>
                  <input id="workspace-name" aria-label="Nome do workspace" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ex.: Casa, Empresa..." maxLength={120} className="h-11 w-full rounded-[12px] border border-border-subtle bg-surface-2 px-3 text-[13px] font-medium text-text-primary outline-none transition-colors focus:border-primary" />
                </div>
                <div>
                  <label htmlFor="workspace-kind" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Tipo</label>
                  <select id="workspace-kind" value={newKind} onChange={(event) => setNewKind(event.target.value as WorkspaceKind)} className="h-11 w-full rounded-[12px] border border-border-subtle bg-surface-2 px-3 text-[13px] font-medium text-text-primary outline-none focus:border-primary">
                    <option value="shared">Compartilhado</option>
                    <option value="personal">Pessoal</option>
                  </select>
                </div>
                <Button type="submit" className="w-full" loading={formBusy} disabled={!newName.trim()}>Criar workspace</Button>
              </form>
            </Card>

            <Card className="border-primary/15 bg-primary-tint/30">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-surface-1 text-primary"><Users size={17} /></span>
                <div>
                  <h2 className="text-[13px] font-extrabold text-text-primary">Workspace ativo</h2>
                  <p className="mt-1 truncate text-[14px] font-bold text-primary">{activeWorkspace?.name ?? "Nenhum selecionado"}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                    {activeWorkspace?.kind === "shared" ? `${activeMembers} membro${activeMembers === 1 ? "" : "s"} com acesso a este ambiente.` : "Ambiente privado, somente para você."}
                  </p>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </main>

      <Dialog open={editingWorkspace !== null} onClose={() => setEditingWorkspace(null)} title="Renomear workspace" description="O novo nome será exibido para todos os membros.">
        <form className="space-y-4" onSubmit={(event) => void handleRename(event)}>
          <label htmlFor="rename-workspace" className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Nome do workspace</label>
          <input id="rename-workspace" value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={120} autoFocus className="h-11 w-full rounded-[12px] border border-border-subtle bg-surface-2 px-3 text-[13px] font-medium text-text-primary outline-none focus:border-primary" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditingWorkspace(null)}>Cancelar</Button>
            <Button type="submit" loading={busyWorkspaceId === editingWorkspace?.id} disabled={!editingName.trim()}>Salvar nome</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={archiveTarget !== null} onClose={() => setArchiveTarget(null)} title="Arquivar workspace?" description="Os dados financeiros permanecem preservados. O ambiente deixará de ser selecionável até ser restaurado.">
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setArchiveTarget(null)}>Cancelar</Button>
          <Button type="button" variant="danger" loading={busyWorkspaceId === archiveTarget?.id} onClick={() => void handleArchive()}>Arquivar workspace</Button>
        </div>
      </Dialog>
    </div>
  );
}
