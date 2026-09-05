"use client";

import { useState, useEffect, useCallback } from "react";
import BottomSheet from "@/components/BottomSheet";
import {
  fetchAdminLlmConfig,
  toggleProvider,
  toggleModel,
  activateModel,
  createProvider,
  createModel,
  deleteProvider,
  deleteModel,
  setFallbackModel,
  type LlmProvider,
  type LlmModel,
  type LlmRuntime,
} from "@/lib/api/admin-agent-llm-config";
import { Cpu, CheckCircle2, AlertCircle, Plus, Trash2 } from "lucide-react";

interface AgentLlmSettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function AgentLlmSettingsSheet({ open, onClose }: AgentLlmSettingsSheetProps) {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [runtime, setRuntime] = useState<LlmRuntime | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedProviderModelId, setSelectedProviderModelId] = useState<string>("");
  const [activeModelChoice, setActiveModelChoice] = useState<string>("");
  const [fallbackModelChoice, setFallbackModelChoice] = useState<string>("");
  const [newProviderId, setNewProviderId] = useState("");
  const [newProviderSecretAlias, setNewProviderSecretAlias] = useState("OPENCODE_ZEN_API_KEY");
  const [newModelIdInput, setNewModelIdInput] = useState("");
  const [newModelProtocol, setNewModelProtocol] = useState<"chat-completions" | "messages" | "responses" | "google-generative-ai">("chat-completions");

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminLlmConfig();
      setProviders(data.providers);
      setModels(data.models);
      setRuntime(data.runtime);
      if (data.providers.length > 0 && !selectedProviderId) {
        setSelectedProviderId(data.providers[0]!.id);
      } else if (data.providers.length > 0 && !data.providers.find((p) => p.id === selectedProviderId)) {
        setSelectedProviderId(data.providers[0]!.id);
      }
      if (data.runtime) {
        const active = data.runtime.activeModelId ?? "";
        const fallback = (data.runtime as unknown as { fallbackModelId?: string | null }).fallbackModelId ?? "";
        setActiveModelChoice(active);
        setFallbackModelChoice(fallback ?? "");
        const filtered = data.models.filter((m) => m.providerId === (selectedProviderId || data.providers[0]?.id));
        if (filtered.length > 0 && !selectedProviderModelId) {
          setSelectedProviderModelId(filtered[0]!.id);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedProviderId, selectedProviderModelId]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void loadConfig();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, loadConfig]);

  const handleToggleProvider = async (providerId: string, current: boolean) => {
    setError(null);
    try {
      await toggleProvider(providerId, !current);
      await loadConfig();
      setActionSuccess(`Provedor ${providerId} ${!current ? "habilitado" : "desabilitado"}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleToggleModel = async (modelId: string, current: boolean) => {
    setError(null);
    try {
      await toggleModel(modelId, !current);
      await loadConfig();
      setActionSuccess(`Modelo ${modelId} ${!current ? "habilitado" : "desabilitado"}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleActivate = async (providerId: string, modelId: string) => {
    if (!runtime) return;
    if (!window.confirm(`Confirma a ativação global de ${providerId}/${modelId} para todos os workspaces?`)) return;
    setError(null);
    try {
      await activateModel({
        providerId,
        modelId,
        expectedVersion: runtime.version,
        rolloutMode: "all",
      });
      await loadConfig();
      setActionSuccess(`Modelo ${modelId} ativado com sucesso como padrão global!`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleSetActiveViaSelector = async () => {
    if (!runtime || !activeModelChoice) return;
    const model = models.find((m) => m.id === activeModelChoice || m.modelId === activeModelChoice);
    if (!model) {
      setError("Modelo atual não encontrado");
      return;
    }
    await handleActivate(model.providerId, model.modelId);
  };

  const handleSetFallback = async () => {
    if (!runtime) return;
    setError(null);
    try {
      const fallbackModel = fallbackModelChoice ? models.find((m) => m.id === fallbackModelChoice || m.modelId === fallbackModelChoice) : null;
      const providerId = fallbackModel ? fallbackModel.providerId : null;
      const modelId = fallbackModel ? fallbackModel.modelId : null;
      await setFallbackModel({
        providerId,
        modelId,
        expectedVersion: runtime.version,
      });
      await loadConfig();
      setActionSuccess(fallbackModel ? `Fallback definido para ${fallbackModel.modelId}` : "Fallback removido");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleCreateProvider = async () => {
    const id = newProviderId.trim();
    if (!id) {
      setError("ID do provedor é obrigatório");
      return;
    }
    setError(null);
    try {
      await createProvider({
        id,
        secretAlias: newProviderSecretAlias,
        kind: id as never,
      });
      setNewProviderId("");
      await loadConfig();
      setActionSuccess(`Provedor ${id} cadastrado`);
      setSelectedProviderId(id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleCreateModel = async () => {
    const modelId = newModelIdInput.trim();
    if (!modelId) {
      setError("Model ID é obrigatório");
      return;
    }
    if (!selectedProviderId) {
      setError("Selecione um provedor");
      return;
    }
    setError(null);
    try {
      await createModel({
        providerId: selectedProviderId,
        modelId,
        protocol: newModelProtocol,
        privacyClass: "training_prohibited",
      });
      setNewModelIdInput("");
      await loadConfig();
      setActionSuccess(`Modelo ${modelId} cadastrado para ${selectedProviderId}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Tem certeza que deseja excluir o provedor ${providerId} e seus modelos?`)) return;
    setError(null);
    try {
      await deleteProvider(providerId);
      if (selectedProviderId === providerId) setSelectedProviderId("");
      await loadConfig();
      setActionSuccess(`Provedor ${providerId} excluído com sucesso.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Tem certeza que deseja excluir o modelo ${modelId}?`)) return;
    setError(null);
    try {
      await deleteModel(modelId);
      await loadConfig();
      setActionSuccess(`Modelo ${modelId} excluído com sucesso.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const providerModels = models.filter((m) => m.providerId === selectedProviderId);

  return (
    <BottomSheet open={open} onClose={onClose} title="Governança TED · LLM">
      <div className="flex flex-col gap-5 pb-8">
        <div className="relative overflow-hidden rounded-[20px] border border-border-subtle bg-surface-2 p-4 shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-xs">
                <Cpu size={16} />
              </span>
              <span className="text-sm font-bold tracking-tight text-text-primary">Runtime Ativo</span>
            </div>
            <span className="rounded-full bg-primary-tint px-2.5 py-1 text-[11px] font-bold tracking-wide text-primary">
              v{runtime?.version ?? 1} • Epoch {runtime?.securityEpoch ?? 1}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-[14px] bg-surface-1 p-3 border border-border-subtle">
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Provedor</div>
              <div className="mt-1 truncate font-mono text-[13px] font-bold text-text-primary">{runtime?.activeProviderId ?? "— Nenhum"}</div>
            </div>
            <div className="rounded-[14px] bg-surface-1 p-3 border border-border-subtle">
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Modelo</div>
              <div className="mt-1 truncate font-mono text-[13px] font-bold text-text-primary">{runtime?.activeModelId ?? "— Nenhum"}</div>
            </div>
          </div>
          {(runtime as unknown as { fallbackProviderId?: string | null; fallbackModelId?: string | null })?.fallbackModelId && (
            <div className="mt-2 rounded-[12px] bg-surface-1 p-2.5 border border-border-subtle">
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Fallback</div>
              <div className="mt-1 font-mono text-[12px] text-text-primary">{(runtime as unknown as { fallbackProviderId?: string | null; fallbackModelId?: string | null }).fallbackModelId}</div>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-[14px] border border-danger/30 bg-danger-tint px-3.5 py-2.5 text-xs font-semibold text-danger">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
        {actionSuccess && (
          <div className="flex items-center gap-2 rounded-[14px] border border-primary/30 bg-primary-tint px-3.5 py-2.5 text-xs font-bold text-primary">
            <CheckCircle2 size={15} />
            {actionSuccess}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm font-medium text-text-muted">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-subtle border-t-primary" />
            Carregando configuração…
          </div>
        ) : (
          <>
            <div className="rounded-[16px] border border-border-subtle bg-surface-1 p-4 shadow-card">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Gerenciar Provedores</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="provider-select" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Provedor
                  </label>
                  <select
                    id="provider-select"
                    aria-label="Provedor"
                    value={selectedProviderId}
                    onChange={(e) => setSelectedProviderId(e.target.value)}
                    className="h-10 w-full rounded-[12px] border border-border-subtle bg-surface-2 px-3 text-[13px] font-medium text-text-primary outline-none focus:border-primary"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label htmlFor="new-provider-id" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      Novo provedor ID
                    </label>
                    <input
                      id="new-provider-id"
                      aria-label="Novo provedor ID"
                      value={newProviderId}
                      onChange={(e) => setNewProviderId(e.target.value)}
                      placeholder="ex.: my-provider"
                      className="h-9 w-full rounded-[10px] border border-border-subtle bg-surface-2 px-3 text-[12px] text-text-primary outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-provider-alias" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      Secret Alias
                    </label>
                    <select
                      id="new-provider-alias"
                      value={newProviderSecretAlias}
                      onChange={(e) => setNewProviderSecretAlias(e.target.value)}
                      className="h-9 w-full rounded-[10px] border border-border-subtle bg-surface-2 px-2 text-[12px] text-text-primary"
                    >
                      <option value="OPENCODE_ZEN_API_KEY">OPENCODE_ZEN_API_KEY</option>
                      <option value="OPENCODE_GO_API_KEY">OPENCODE_GO_API_KEY</option>
                      <option value="OPENAI_API_KEY">OPENAI_API_KEY</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCreateProvider()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-[12px] bg-primary px-4 py-2.5 text-[13px] font-bold text-white hover:bg-primary-hover"
                >
                  <Plus size={14} /> Cadastrar Provedor
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateProvider()}
                  aria-label="Novo Provedor"
                  className="hidden"
                >
                  Novo Provedor
                </button>
              </div>
            </div>

            <div className="rounded-[16px] border border-border-subtle bg-surface-1 p-4 shadow-card">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Modelos do Provedor</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="provider-model-select" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Modelo do provedor
                  </label>
                  <select
                    id="provider-model-select"
                    aria-label="Modelo do provedor"
                    value={selectedProviderModelId}
                    onChange={(e) => setSelectedProviderModelId(e.target.value)}
                    className="h-10 w-full rounded-[12px] border border-border-subtle bg-surface-2 px-3 text-[13px] font-medium text-text-primary outline-none focus:border-primary"
                  >
                    {providerModels.length === 0 ? (
                      <option value="">Nenhum modelo</option>
                    ) : (
                      providerModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.modelId} ({m.protocol})
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div>
                    <label htmlFor="new-model-id" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      Novo modelo ID
                    </label>
                    <input
                      id="new-model-id"
                      aria-label="Novo modelo ID"
                      value={newModelIdInput}
                      onChange={(e) => setNewModelIdInput(e.target.value)}
                      placeholder="ex.: gpt-4o-mini"
                      className="h-9 w-full rounded-[10px] border border-border-subtle bg-surface-2 px-3 text-[12px] text-text-primary outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-model-protocol" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      Protocolo
                    </label>
                    <select
                      id="new-model-protocol"
                      value={newModelProtocol}
                      onChange={(e) => setNewModelProtocol(e.target.value as never)}
                      className="h-9 w-full rounded-[10px] border border-border-subtle bg-surface-2 px-2 text-[12px] text-text-primary"
                    >
                      <option value="chat-completions">chat-completions</option>
                      <option value="responses">responses</option>
                      <option value="messages">messages</option>
                      <option value="google-generative-ai">google-generative-ai</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCreateModel()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 py-2.5 text-[13px] font-bold text-white hover:bg-primary-hover h-9"
                  >
                    <Plus size={14} /> Cadastrar Modelo
                  </button>
                </div>
                <button type="button" aria-label="Novo Modelo" onClick={() => void handleCreateModel()} className="hidden">
                  Novo Modelo
                </button>
                <button type="button" aria-label="Adicionar Modelo" onClick={() => void handleCreateModel()} className="hidden">
                  Adicionar Modelo
                </button>
              </div>
            </div>

            <div className="rounded-[16px] border border-border-subtle bg-surface-1 p-4 shadow-card">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Governança Ativa</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="active-model-select" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Modelo Atual
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="active-model-select"
                      aria-label="Modelo Atual"
                      value={activeModelChoice}
                      onChange={(e) => setActiveModelChoice(e.target.value)}
                      className="h-10 flex-1 rounded-[12px] border border-border-subtle bg-surface-2 px-3 text-[13px] font-medium text-text-primary outline-none focus:border-primary"
                    >
                      <option value="">Selecione...</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.providerId}/{m.modelId}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleSetActiveViaSelector()}
                      className="rounded-[12px] bg-primary px-4 py-2 text-[13px] font-bold text-white hover:bg-primary-hover"
                    >
                      Ativar
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="fallback-model-select" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Modelo de Fallback
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="fallback-model-select"
                      aria-label="Modelo de Fallback"
                      value={fallbackModelChoice}
                      onChange={(e) => setFallbackModelChoice(e.target.value)}
                      className="h-10 flex-1 rounded-[12px] border border-border-subtle bg-surface-2 px-3 text-[13px] font-medium text-text-primary outline-none focus:border-primary"
                    >
                      <option value="">Nenhum (sem fallback)</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.providerId}/{m.modelId}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleSetFallback()}
                      className="rounded-[12px] bg-surface-2 border border-border-subtle px-4 py-2 text-[13px] font-bold text-text-primary hover:bg-surface-3"
                    >
                      Salvar Fallback
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                <span className="h-1 w-5 rounded-full bg-primary" />
                Provedores
              </h3>
              <div className="flex flex-col gap-2.5">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center justify-between gap-3 rounded-[18px] border border-border-subtle bg-surface-1 p-4 shadow-card transition-all hover:bg-surface-2/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-bold tracking-tight text-text-primary">{p.name}</span>
                        <span className="hidden sm:inline-flex rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] font-semibold text-text-secondary border border-border-subtle">{p.id}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <code className="rounded-[8px] bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-text-secondary border border-border-subtle">{p.secretAlias || "—"}</code>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            p.eligibility === "approved"
                              ? "bg-primary-tint text-primary"
                              : p.eligibility === "candidate"
                                ? "bg-warning-tint text-warning"
                                : "bg-surface-2 text-text-muted"
                          }`}
                        >
                          {p.eligibility}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleProvider(p.id, p.enabled)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                          p.enabled
                            ? "bg-primary text-white shadow-fab hover:bg-primary-hover"
                            : "bg-surface-2 border border-border-subtle text-text-secondary hover:bg-surface-3"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${p.enabled ? "bg-white" : "bg-text-muted"}`} />
                        {p.enabled ? "Ativo" : "Inativo"}
                      </button>
                      <button
                        type="button"
                        aria-label={`Excluir provedor ${p.id}`}
                        onClick={() => void handleDeleteProvider(p.id)}
                        className="rounded-full p-1.5 text-text-muted hover:text-danger hover:bg-danger-tint transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                <span className="h-1 w-5 rounded-full bg-accent-money" />
                Modelos
              </h3>
              <div className="flex flex-col gap-2.5">
                {models.map((m) => {
                  const isCurrentActive =
                    runtime?.activeProviderId === m.providerId &&
                    (runtime?.activeModelId === m.id || runtime?.activeModelId === m.modelId);
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-3 rounded-[18px] border p-4 shadow-card sm:flex-row sm:items-center sm:justify-between transition-all ${
                        isCurrentActive ? "border-primary/40 bg-primary-tint/20" : "border-border-subtle bg-surface-1 hover:bg-surface-2/50"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-[13px] font-bold tracking-tight text-text-primary">{m.modelId}</span>
                          {isCurrentActive && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Ativo
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-text-secondary border border-border-subtle">{m.providerId}</span>
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-text-secondary border border-border-subtle">{m.protocol}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => void handleToggleModel(m.id, m.enabled)}
                          disabled={isCurrentActive}
                          aria-disabled={isCurrentActive}
                          title={isCurrentActive ? "Modelo ativo — desative outro modelo antes de desabilitar este" : undefined}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                            m.enabled ? "bg-surface-2 border border-primary/30 text-primary hover:bg-primary-tint" : "bg-surface-2 border border-border-subtle text-text-muted hover:bg-surface-3"
                          } ${isCurrentActive ? "opacity-60" : ""}`}
                        >
                          {isCurrentActive ? "Ativo · Habilitado" : m.enabled ? "Habilitado" : "Desabilitado"}
                        </button>
                        {!isCurrentActive && m.enabled && (
                          <button
                            type="button"
                            onClick={() => void handleActivate(m.providerId, m.modelId)}
                            className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover active:scale-95 transition-all"
                          >
                            Ativar Global
                          </button>
                        )}
                        {!isCurrentActive && (
                          <button
                            type="button"
                            aria-label={`Excluir modelo ${m.modelId}`}
                            onClick={() => void handleDeleteModel(m.id)}
                            className="rounded-full p-1.5 text-text-muted hover:text-danger hover:bg-danger-tint transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
