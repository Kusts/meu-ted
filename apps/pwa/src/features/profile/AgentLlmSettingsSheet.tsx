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
    <BottomSheet open={open} onClose={onClose} title="Governança TED · LLM">
      <div className="flex flex-col gap-6 pb-8">
        {/* Runtime status — premium card with gradient */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 p-4 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/60 to-transparent" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </span>
              <span className="text-sm font-bold tracking-tight text-emerald-900">Runtime Ativo</span>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold tracking-wide text-emerald-700 shadow-sm ring-1 ring-emerald-200">
              v{runtime?.version ?? 1} • Epoch {runtime?.securityEpoch ?? 1}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/80 p-3 shadow-sm ring-1 ring-black/5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Provedor</div>
              <div className="mt-1 truncate text-sm font-bold text-slate-900">{runtime?.activeProviderId ?? "— Nenhum"}</div>
            </div>
            <div className="rounded-xl bg-white/80 p-3 shadow-sm ring-1 ring-black/5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Modelo</div>
              <div className="mt-1 truncate text-sm font-bold text-slate-900">{runtime?.activeModelId ?? "— Nenhum"}</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-800 shadow-sm">{error}</div>
        )}
        {actionSuccess && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800 shadow-sm">{actionSuccess}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" />
            Carregando configuração…
          </div>
        ) : (
          <>
            {/* Providers */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <span className="h-1 w-6 rounded-full bg-emerald-500" />
                Provedores
              </h3>
              <div className="flex flex-col gap-2.5">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold tracking-tight text-slate-900">{p.name}</span>
                        <span className="hidden sm:inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-600 ring-1 ring-slate-200">{p.id}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <code className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-mono text-slate-600 ring-1 ring-slate-200">{p.secretAlias || "—"}</code>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                            p.eligibility === "approved"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : p.eligibility === "candidate"
                                ? "bg-amber-50 text-amber-700 ring-amber-200"
                                : "bg-slate-100 text-slate-600 ring-slate-200"
                          }`}
                        >
                          {p.eligibility}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggleProvider(p.id, p.enabled)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm ring-1 transition ${
                        p.enabled
                          ? "bg-emerald-600 text-white shadow-emerald-600/20 ring-emerald-600 hover:bg-emerald-700"
                          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${p.enabled ? "bg-white" : "bg-slate-400"}`} />
                      {p.enabled ? "Ativo" : "Inativo"}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Models */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <span className="h-1 w-6 rounded-full bg-violet-500" />
                Modelos
              </h3>
              <div className="flex flex-col gap-2.5">
                {models.map((m) => {
                  const isCurrentActive = runtime?.activeProviderId === m.providerId && runtime?.activeModelId === m.modelId;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
                        isCurrentActive ? "border-emerald-200 bg-emerald-50/40 shadow-emerald-500/10" : "border-slate-200 hover:border-slate-300 hover:shadow-md"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold tracking-tight text-slate-900">{m.modelId}</span>
                          {isCurrentActive && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Ativo
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 ring-1 ring-slate-200">{m.providerId}</span>
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700 ring-1 ring-violet-200">{m.protocol}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => void handleToggleModel(m.id, m.enabled)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 transition ${
                            m.enabled ? "bg-white text-emerald-700 ring-emerald-200 hover:bg-emerald-50" : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {m.enabled ? "Habilitado" : "Desabilitado"}
                        </button>
                        {!isCurrentActive && m.enabled && (
                          <button
                            type="button"
                            onClick={() => void handleActivate(m.providerId, m.modelId)}
                            className="rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black"
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
