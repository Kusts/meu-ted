import { apiFetch } from "./client";

export type Protocol = "chat-completions" | "messages" | "responses" | "google-generative-ai";
export type PrivacyClass = "training_prohibited" | "zero_retention_required" | "enterprise_standard";
export type RolloutMode = "disabled" | "canary" | "all";
export type ProviderEligibility = "approved" | "candidate" | "experimental_blocked";

export type LlmProvider = {
  id: string;
  kind: string;
  transport: string;
  authMode: string;
  name?: string | null;
  baseUrl?: string | null;
  secretAlias: string | null;
  eligibility: ProviderEligibility;
  runtimeStatus?: string | null;
  enabled: boolean;
};

export type LlmModel = {
  id: string;
  providerId: string;
  modelId: string;
  protocol: Protocol;
  privacyClass: PrivacyClass;
  retention: string | null;
  enabled: boolean;
};

export type LlmRuntime = {
  fallbackProviderId?: string | null;
  fallbackModelId?: string | null;
  id: number;
  version: number;
  activeProviderId: string | null;
  activeModelId: string | null;
  activeProtocol: Protocol | null;
  activeRolloutPercentage: number;
  securityEpoch: number;
  updatedBy: string;
  updatedAt: string;
};

export type AdminLlmConfigResponse = {
  providers: LlmProvider[];
  models: LlmModel[];
  runtime: LlmRuntime | null;
};

export const fetchAdminLlmConfig = async (): Promise<AdminLlmConfigResponse> => {
  return apiFetch<AdminLlmConfigResponse>("/admin/agent/llm-config");
};

export const toggleProvider = async (providerId: string, enabled: boolean): Promise<{ provider: LlmProvider }> => {
  return apiFetch<{ provider: LlmProvider }>(`/admin/agent/llm-config/providers/${encodeURIComponent(providerId)}/toggle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
};

export const toggleModel = async (modelId: string, enabled: boolean): Promise<{ model: LlmModel }> => {
  return apiFetch<{ model: LlmModel }>(`/admin/agent/llm-config/models/${encodeURIComponent(modelId)}/toggle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
};

export const activateModel = async (input: {
  providerId: string;
  modelId: string;
  expectedVersion: number;
  rolloutMode?: RolloutMode;
}): Promise<{ ok: boolean; runtime: LlmRuntime }> => {
  return apiFetch<{ ok: boolean; runtime: LlmRuntime }>("/admin/agent/llm-config/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
};

export const createProvider = async (input: {
  id: string;
  name?: string;
  kind?: string;
  transport?: string;
  authMode?: string;
  baseUrl?: string;
  secretAlias: string;
  eligibility?: ProviderEligibility;
  enabled?: boolean;
}): Promise<{ provider: LlmProvider }> => {
  return apiFetch<{ provider: LlmProvider }>("/admin/agent/llm-config/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
};

export const updateProvider = async (
  providerId: string,
  patch: Partial<Pick<LlmProvider, "secretAlias" | "eligibility" | "enabled">>,
): Promise<{ provider: LlmProvider }> => {
  return apiFetch<{ provider: LlmProvider }>(`/admin/agent/llm-config/providers/${encodeURIComponent(providerId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
};

export const deleteProvider = async (providerId: string): Promise<{ ok: boolean }> => {
  return apiFetch<{ ok: boolean }>(`/admin/agent/llm-config/providers/${encodeURIComponent(providerId)}`, {
    method: "DELETE",
  });
};

export const createModel = async (input: {
  providerId: string;
  modelId: string;
  protocol?: Protocol;
  privacyClass?: PrivacyClass;
  retention?: string | null;
  enabled?: boolean;
}): Promise<{ model: LlmModel }> => {
  return apiFetch<{ model: LlmModel }>("/admin/agent/llm-config/models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
};

export const deleteModel = async (modelId: string): Promise<{ ok: boolean }> => {
  return apiFetch<{ ok: boolean }>(`/admin/agent/llm-config/models/${encodeURIComponent(modelId)}`, {
    method: "DELETE",
  });
};

export const setFallbackModel = async (input: {
  providerId: string | null;
  modelId: string | null;
  expectedVersion: number;
}): Promise<{ ok: boolean; runtime: LlmRuntime }> => {
  return apiFetch<{ ok: boolean; runtime: LlmRuntime }>("/admin/agent/llm-config/fallback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
};

export const syncCatalog = async (
  items: Array<{
    providerId: string;
    modelId: string;
    protocol?: Protocol;
    privacyClass?: PrivacyClass;
    retention?: string;
  }>,
): Promise<{ ok: boolean; synced: number }> => {
  return apiFetch<{ ok: boolean; synced: number }>("/admin/agent/llm-config/sync-catalog", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
};
