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
    <BottomSheet open={open} onClose={onClose} title="Painel Admin LLM TED">
      <div className="flex flex-col gap-5 pb-6">
        {/* Runtime status */}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-xs">
          <div className="flex items-center justify-between font-bold text-primary">
            <span>Configuração Ativa (v{runtime?.version ?? 1})</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px]">
              Epoch {runtime?.securityEpoch ?? 1}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-text-secondary">
            <div>
              Provedor: <strong className="text-text-primary">{runtime?.activeProviderId ?? "Nenhum"}</strong>
            </div>
            <div>
              Modelo: <strong className="text-text-primary">{runtime?.activeModelId ?? "Nenhum"}</strong>
            </div>
          </div>
        </div>

        {error && <div className="rounded-xl bg-danger/10 p-3 text-xs text-danger">{error}</div>}
        {actionSuccess && <div className="rounded-xl bg-accent-green/10 p-3 text-xs text-accent-green">{actionSuccess}</div>}

        {/* Providers */}
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Provedores Configurados</h3>
          <div className="flex flex-col gap-2">
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-border bg-fill-light p-3 text-xs"
              >
                <div>
                  <div className="font-bold text-text-primary">{p.name} ({p.id})</div>
                  <div className="mt-0.5 text-[11px] text-text-muted">
                    Alias Secret: <code className="text-text-secondary">{p.secretAlias}</code>
                  </div>
                  <div className="mt-1">
                    <span
                      className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        p.eligibility === "approved"
                          ? "bg-accent-green/15 text-accent-green"
                          : p.eligibility === "candidate"
                            ? "bg-warning/15 text-warning-dark"
                            : "bg-danger/15 text-danger"
                      }`}
                    >
                      {p.eligibility}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleProvider(p.id, p.enabled)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    p.enabled ? "bg-primary text-white" : "border border-border bg-bg-surface text-text-muted"
                  }`}
                >
                  {p.enabled ? "Ativo" : "Inativo"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Models */}
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Modelos Disponíveis</h3>
          <div className="flex flex-col gap-2">
            {models.map((m) => {
              const isCurrentActive = runtime?.activeProviderId === m.providerId && runtime?.activeModelId === m.modelId;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-fill-light p-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-text-primary">{m.modelId}</div>
                    <div className="mt-0.5 text-[11px] text-text-muted">
                      Provedor: {m.providerId} · Protocolo: {m.protocol}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleToggleModel(m.id, m.enabled)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        m.enabled ? "bg-accent-green/20 text-accent-green" : "border border-border bg-bg-surface text-text-muted"
                      }`}
                    >
                      {m.enabled ? "Habilitado" : "Desabilitado"}
                    </button>
                    {!isCurrentActive && m.enabled && (
                      <button
                        type="button"
                        onClick={() => void handleActivate(m.providerId, m.modelId)}
                        className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-primary-dark"
                      >
                        Ativar Global
                      </button>
                    )}
                    {isCurrentActive && (
                      <span className="rounded-lg bg-primary/15 px-2 py-1 text-[11px] font-bold text-primary">
                        Ativo
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
