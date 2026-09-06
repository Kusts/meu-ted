import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  fetchAdminLlmConfig,
  toggleProvider as apiToggleProvider,
  toggleModel as apiToggleModel,
  activateModel as apiActivateModel,
  createProvider as apiCreateProvider,
  createModel as apiCreateModel,
  deleteProvider as apiDeleteProvider,
  deleteModel as apiDeleteModel,
  setFallbackModel as apiSetFallbackModel,
  type AdminLlmConfigResponse,
  type LlmProvider,
  type LlmModel,
  type LlmRuntime,
} from "@/lib/api/admin-agent-llm-config";
import { LLM_PROVIDER_PRESETS } from "@/lib/llm-presets";
import { isProviderKind } from "@pi-finance/llm-contracts/types";
import { ApiError } from "@/lib/api/client";
import { formatApiError } from "@/lib/api/format-api-error";

const isAbortError = (e: unknown): boolean =>
  (e as { name?: string } | null)?.name === "AbortError";

const isVersionConflict = (e: unknown): boolean =>
  e instanceof ApiError && e.code === "agent.version_conflict";

export interface UseAdminLlmConfig {
  providers: LlmProvider[];
  models: LlmModel[];
  runtime: LlmRuntime | null;
  loading: boolean;
  error: string | null;
  actionSuccess: string | null;
  isMutating: boolean;
  selectedProviderId: string;
  selectedProviderModelId: string;
  activeModelChoice: string;
  fallbackModelChoice: string;
  providerModels: LlmModel[];
  setSelectedProviderModelId: (id: string) => void;
  setActiveModelChoice: (id: string) => void;
  setFallbackModelChoice: (id: string) => void;
  selectProvider: (id: string) => void;
  load: () => Promise<AdminLlmConfigResponse | null>;
  toggleProvider: (providerId: string, current: boolean) => Promise<boolean>;
  toggleModel: (modelId: string, current: boolean) => Promise<boolean>;
  activate: (providerId: string, modelId: string) => Promise<boolean>;
  setActiveViaSelector: () => Promise<boolean>;
  setFallback: () => Promise<boolean>;
  createProvider: (id: string, secretAlias: string) => Promise<boolean>;
  createPreset: (presetId: string) => Promise<boolean>;
  createModel: (providerId: string, modelId: string, protocol: LlmModel["protocol"]) => Promise<boolean>;
  deleteProvider: (providerId: string) => Promise<boolean>;
  deleteModel: (modelId: string) => Promise<boolean>;
}

/**
 * Server + selection state for the LLM governance sheet. Owns loading with
 * an AbortController (superseded loads and unmount are cancelled), tracks
 * in-flight mutations, retries activate/fallback once on 409 version
 * conflicts, and runs preset creation as a transaction with partial-failure
 * reporting. Actions resolve true on success so the presenter can clear
 * form inputs. The sheet stays a presenter over this hook.
 */
export function useAdminLlmConfig(): UseAdminLlmConfig {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [runtime, setRuntime] = useState<LlmRuntime | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedProviderModelId, setSelectedProviderModelId] = useState<string>("");
  const [activeModelChoice, setActiveModelChoice] = useState<string>("");
  const [fallbackModelChoice, setFallbackModelChoice] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);
  const providersRef = useRef(providers);
  const selectedProviderIdRef = useRef(selectedProviderId);
  const selectedProviderModelIdRef = useRef(selectedProviderModelId);
  const modelsRef = useRef(models);
  const activeModelChoiceRef = useRef(activeModelChoice);
  const fallbackModelChoiceRef = useRef(fallbackModelChoice);
  const runtimeRef = useRef(runtime);

  useEffect(() => {
    providersRef.current = providers;
  }, [providers]);
  useEffect(() => {
    selectedProviderIdRef.current = selectedProviderId;
  }, [selectedProviderId]);
  useEffect(() => {
    selectedProviderModelIdRef.current = selectedProviderModelId;
  }, [selectedProviderModelId]);
  useEffect(() => {
    modelsRef.current = models;
  }, [models]);
  useEffect(() => {
    activeModelChoiceRef.current = activeModelChoice;
  }, [activeModelChoice]);
  useEffect(() => {
    fallbackModelChoiceRef.current = fallbackModelChoice;
  }, [fallbackModelChoice]);
  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  // Abort any in-flight load on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const load = useCallback(async (): Promise<AdminLlmConfigResponse | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminLlmConfig(controller.signal);
      if (abortRef.current !== controller) return null;
      setProviders(data.providers);
      setModels(data.models);
      setRuntime(data.runtime);
      const currentProviderId = selectedProviderIdRef.current;
      if (data.providers.length > 0 && !currentProviderId) {
        setSelectedProviderId(data.providers[0]!.id);
      } else if (data.providers.length > 0 && !data.providers.find((p) => p.id === currentProviderId)) {
        setSelectedProviderId(data.providers[0]!.id);
      }
      if (data.runtime) {
        const active = data.runtime.activeModelId ?? "";
        const fallback = data.runtime.fallbackModelId ?? "";
        setActiveModelChoice(active);
        setFallbackModelChoice(fallback ?? "");
        const currentModelId = selectedProviderModelIdRef.current;
        const providerForFilter = currentProviderId || data.providers[0]?.id;
        const filtered = data.models.filter((m) => m.providerId === providerForFilter);
        if (filtered.length > 0 && !currentModelId) {
          setSelectedProviderModelId(filtered[0]!.id);
        }
      }
      return data;
    } catch (e) {
      if (abortRef.current !== controller || isAbortError(e)) return null;
      setError(formatApiError(e));
      return null;
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  const mutate = useCallback(
    async (fn: () => Promise<string>): Promise<boolean> => {
      setError(null);
      setIsMutating(true);
      try {
        const message = await fn();
        await load();
        setActionSuccess(message);
        return true;
      } catch (e) {
        if (!isAbortError(e)) setError(formatApiError(e));
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [load],
  );

  const toggleProvider = useCallback(
    (providerId: string, current: boolean) =>
      mutate(async () => {
        await apiToggleProvider(providerId, !current);
        return `Provedor ${providerId} ${!current ? "habilitado" : "desabilitado"}.`;
      }),
    [mutate],
  );

  const toggleModel = useCallback(
    (modelId: string, current: boolean) =>
      mutate(async () => {
        await apiToggleModel(modelId, !current);
        return `Modelo ${modelId} ${!current ? "habilitado" : "desabilitado"}.`;
      }),
    [mutate],
  );

  const activateWithVersion = useCallback(async (providerId: string, modelId: string, expectedVersion: number) => {
    await apiActivateModel({ providerId, modelId, expectedVersion, rolloutMode: "all" });
  }, []);

  const activate = useCallback(
    (providerId: string, modelId: string) =>
      mutate(async () => {
        const version = runtimeRef.current?.version;
        if (version === undefined) throw new Error("Configuração ainda não carregada");
        try {
          await activateWithVersion(providerId, modelId, version);
        } catch (e) {
          if (!isVersionConflict(e)) throw e;
          // Single retry: reload once, then retry with the fresh version.
          const reloaded = await load();
          const freshVersion = reloaded?.runtime?.version;
          if (freshVersion === undefined) throw e;
          await activateWithVersion(providerId, modelId, freshVersion);
        }
        return `Modelo ${modelId} ativado com sucesso como padrão global!`;
      }),
    [mutate, load, activateWithVersion],
  );

  const setActiveViaSelector = useCallback(async (): Promise<boolean> => {
    const choice = activeModelChoiceRef.current;
    const model = modelsRef.current.find((m) => m.id === choice || m.modelId === choice);
    if (!model) {
      setError("Modelo atual não encontrado");
      return false;
    }
    return activate(model.providerId, model.modelId);
  }, [activate]);

  const setFallback = useCallback(async (): Promise<boolean> => {
    const choice = fallbackModelChoiceRef.current;
    const fallbackModel = choice
      ? (modelsRef.current.find((m) => m.id === choice || m.modelId === choice) ?? null)
      : null;
    const version = runtimeRef.current?.version;
    if (version === undefined) return false;
    return mutate(async () => {
      const attempt = (expectedVersion: number) =>
        apiSetFallbackModel({
          providerId: fallbackModel ? fallbackModel.providerId : null,
          modelId: fallbackModel ? fallbackModel.modelId : null,
          expectedVersion,
        });
      try {
        await attempt(version);
      } catch (e) {
        // Fase 3 R6: same single-retry policy as activate — a 409 only means
        // the version moved under us, so reload once and retry fresh.
        if (!isVersionConflict(e)) throw e;
        const reloaded = await load();
        const freshVersion = reloaded?.runtime?.version;
        if (freshVersion === undefined) throw e;
        await attempt(freshVersion);
      }
      return fallbackModel ? `Fallback definido para ${fallbackModel.modelId}` : "Fallback removido";
    });
  }, [mutate, load]);

  const createProvider = useCallback(
    (id: string, secretAlias: string): Promise<boolean> => {
      const trimmed = id.trim();
      if (!trimmed) {
        setError("ID do provedor é obrigatório");
        return Promise.resolve(false);
      }
      if (!isProviderKind(trimmed)) {
        setError(`kind inválido: ${trimmed}`);
        return Promise.resolve(false);
      }
      return mutate(async () => {
        await apiCreateProvider({ id: trimmed, secretAlias, kind: trimmed });
        setSelectedProviderId(trimmed);
        return `Provedor ${trimmed} cadastrado`;
      });
    },
    [mutate],
  );

  const createPreset = useCallback(
    (presetId: string): Promise<boolean> =>
      mutate(async () => {
        const preset = LLM_PROVIDER_PRESETS.find((p) => p.id === presetId);
        if (!preset) throw new Error(`Preset ${presetId} não encontrado`);
        if (providersRef.current.some((p) => p.id === preset.id)) {
          setSelectedProviderId(preset.id);
          throw new Error(`Provedor ${preset.name} já existe`);
        }
        const failures: string[] = [];
        try {
          await apiCreateProvider({
            id: preset.id,
            name: preset.name,
            kind: preset.kind,
            transport: preset.transport,
            authMode: preset.authMode,
            secretAlias: preset.secretAlias ?? "OPENAI_API_KEY",
            eligibility: "approved",
            enabled: true,
          });
        } catch (e) {
          failures.push(`createProvider ${preset.id}: ${(e as Error).message}`);
        }
        try {
          await apiToggleProvider(preset.id, true);
        } catch (e) {
          failures.push(`toggleProvider ${preset.id}: ${(e as Error).message}`);
        }
        for (const m of preset.autoModels) {
          try {
            await apiCreateModel({
              providerId: preset.id,
              modelId: m.modelId,
              protocol: m.protocol,
              privacyClass: m.privacyClass,
              enabled: true,
            });
          } catch (e) {
            failures.push(`createModel ${m.modelId}: ${(e as Error).message}`);
          }
          try {
            const modelId = `${preset.id}:${m.modelId}`;
            await apiToggleModel(modelId, true);
          } catch (e) {
            failures.push(`toggleModel ${m.modelId}: ${(e as Error).message}`);
          }
        }
        setSelectedProviderId(preset.id);
        if (failures.length > 0) {
          throw new Error(`Preset parcial: ${failures.join(", ")}`);
        }
        return `Provedor ${preset.name} cadastrado com ${preset.autoModels.length} modelos`;
      }),
    [mutate],
  );

  const createModel = useCallback(
    (providerId: string, modelIdInput: string, protocol: LlmModel["protocol"]): Promise<boolean> => {
      const modelId = modelIdInput.trim();
      if (!modelId) {
        setError("Model ID é obrigatório");
        return Promise.resolve(false);
      }
      if (!providerId) {
        setError("Selecione um provedor");
        return Promise.resolve(false);
      }
      return mutate(async () => {
        await apiCreateModel({
          providerId,
          modelId,
          protocol,
          privacyClass: "training_prohibited",
        });
        return `Modelo ${modelId} cadastrado para ${providerId}`;
      });
    },
    [mutate],
  );

  const deleteProvider = useCallback(
    (providerId: string): Promise<boolean> =>
      mutate(async () => {
        const providerModelIds = new Set(
          modelsRef.current.filter((m) => m.providerId === providerId).map((m) => m.id),
        );
        await apiDeleteProvider(providerId);
        if (selectedProviderIdRef.current === providerId) setSelectedProviderId("");
        if (providerModelIds.has(selectedProviderModelIdRef.current)) setSelectedProviderModelId("");
        if (providerModelIds.has(activeModelChoiceRef.current)) setActiveModelChoice("");
        if (providerModelIds.has(fallbackModelChoiceRef.current)) setFallbackModelChoice("");
        return `Provedor ${providerId} excluído com sucesso.`;
      }),
    [mutate],
  );

  const deleteModel = useCallback(
    (modelId: string): Promise<boolean> =>
      mutate(async () => {
        await apiDeleteModel(modelId);
        return `Modelo ${modelId} excluído com sucesso.`;
      }),
    [mutate],
  );

  const selectProvider = useCallback((id: string) => {
    setSelectedProviderId(id);
    const firstModel = modelsRef.current.find((m) => m.providerId === id);
    setSelectedProviderModelId(firstModel ? firstModel.id : "");
  }, []);

  const providerModels = useMemo(
    () => models.filter((m) => m.providerId === selectedProviderId),
    [models, selectedProviderId],
  );

  return {
    providers,
    models,
    runtime,
    loading,
    error,
    actionSuccess,
    isMutating,
    selectedProviderId,
    selectedProviderModelId,
    activeModelChoice,
    fallbackModelChoice,
    providerModels,
    setSelectedProviderModelId,
    setActiveModelChoice,
    setFallbackModelChoice,
    selectProvider,
    load,
    toggleProvider,
    toggleModel,
    activate,
    setActiveViaSelector,
    setFallback,
    createProvider,
    createPreset,
    createModel,
    deleteProvider,
    deleteModel,
  };
}
