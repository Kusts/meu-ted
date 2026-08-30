"use client";

import { useState, useEffect, useCallback } from "react";
import BottomSheet from "@/components/BottomSheet";
import {
  fetchAdminLlmConfig,
  toggleProvider,
  toggleModel,
  activateModel,
  type LlmProvider,
  type LlmModel,
  type LlmRuntime,
} from "@/lib/api/admin-agent-llm-config";
import { Cpu, CheckCircle2, AlertCircle } from "lucide-react";

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

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminLlmConfig();
      setProviders(data.providers);
      setModels(data.models);
      setRuntime(data.runtime);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadConfig();
    }
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

  return (
    <BottomSheet open={open} onClose={onClose} title="Governança TED · LLM">
      <div className="flex flex-col gap-5 pb-8">
        {/* Runtime status */}
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
            {/* Providers */}
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
                  </div>
                ))}
              </div>
            </div>

            {/* Models */}
            <div>
              <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                <span className="h-1 w-5 rounded-full bg-accent-money" />
                Modelos
              </h3>
              <div className="flex flex-col gap-2.5">
                {models.map((m) => {
                  const isCurrentActive = runtime?.activeProviderId === m.providerId && runtime?.activeModelId === m.modelId;
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
                          className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                            m.enabled ? "bg-surface-2 border border-primary/30 text-primary hover:bg-primary-tint" : "bg-surface-2 border border-border-subtle text-text-muted hover:bg-surface-3"
                          }`}
                        >
                          {m.enabled ? "Habilitado" : "Desabilitado"}
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
