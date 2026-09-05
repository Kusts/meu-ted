export type RuntimeSnapshot = {
  version: number;
  activeProviderId: string | null;
  activeModelId: string | null;
  activeProtocol: string | null;
  activeRolloutPercentage: number;
  securityEpoch: number;
  fallbackProviderId?: string | null;
  fallbackModelId?: string | null;
  catalogVersion?: number;
};

export const fetchRuntimeConfig = async (
  apiOrigin: string,
  configToken: string,
): Promise<RuntimeSnapshot> => {
  if (!apiOrigin || !configToken) {
    throw new Error('apiOrigin and configToken are required to fetch runtime configuration');
  }

  const url = `${apiOrigin.replace(/\/$/, '')}/internal/agent/llm-config`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-agent-config-token': configToken,
      accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to fetch runtime config: HTTP ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const runtime = (data.runtime as Record<string, unknown>) ?? data;
  const model = (data.model as Record<string, unknown>) ?? null;
  const fallbackModel = (data.fallbackModel as Record<string, unknown>) ?? null;

  const providerId = typeof runtime.activeProviderId === 'string'
    ? runtime.activeProviderId
    : typeof runtime.providerId === 'string'
      ? runtime.providerId
      : null;
  const rawModelId = typeof runtime.activeModelId === 'string'
    ? runtime.activeModelId
    : typeof runtime.modelId === 'string'
      ? runtime.modelId
      : null;
  const modelId = typeof model?.modelId === 'string' ? model.modelId : rawModelId;

  const fallbackProviderId = typeof runtime.fallbackProviderId === 'string'
    ? runtime.fallbackProviderId
    : null;
  const rawFallbackModelId = typeof runtime.fallbackModelId === 'string'
    ? runtime.fallbackModelId
    : null;
  const fallbackModelId = typeof fallbackModel?.modelId === 'string' ? fallbackModel.modelId : rawFallbackModelId;

  return {
    version: typeof runtime.version === 'number' ? runtime.version : 1,
    activeProviderId: providerId,
    activeModelId: modelId,
    fallbackProviderId,
    fallbackModelId,
    activeProtocol: typeof model?.protocol === 'string'
      ? model.protocol
      : typeof runtime.activeProtocol === 'string'
        ? runtime.activeProtocol
        : null,
    activeRolloutPercentage: typeof runtime.activeRolloutPercentage === 'number'
      ? runtime.activeRolloutPercentage
      : 100,
    securityEpoch: typeof runtime.securityEpoch === 'number' ? runtime.securityEpoch : 1,
    catalogVersion: typeof runtime.catalogVersion === 'number' ? runtime.catalogVersion : undefined,
  };
};
