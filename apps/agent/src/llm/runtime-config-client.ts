import type { InternalLlmSnapshot, RuntimeSnapshot } from '@pi-finance/llm-contracts/types';

export type { RuntimeSnapshot };

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

  const data = (await res.json()) as Partial<InternalLlmSnapshot>;
  const runtime = data.runtime;
  if (!runtime || typeof runtime !== 'object') {
    throw new Error('Invalid runtime snapshot: missing runtime object');
  }

  // Explicit active* contract only: legacy `providerId`/`modelId` names and
  // provider/model slots are never read here. A fail-closed snapshot carries
  // null active ids, which surface here as an unusable (null) configuration.
  return {
    version: typeof runtime.version === 'number' ? runtime.version : 1,
    securityEpoch: typeof runtime.securityEpoch === 'number' ? runtime.securityEpoch : 1,
    activeProviderId: typeof runtime.activeProviderId === 'string' ? runtime.activeProviderId : null,
    activeModelId: typeof runtime.activeModelId === 'string' ? runtime.activeModelId : null,
    activeProtocol: typeof runtime.activeProtocol === 'string' ? runtime.activeProtocol : null,
    activeRolloutPercentage:
      typeof runtime.activeRolloutPercentage === 'number' ? runtime.activeRolloutPercentage : 100,
    fallbackProviderId:
      typeof runtime.fallbackProviderId === 'string' ? runtime.fallbackProviderId : null,
    fallbackModelId: typeof runtime.fallbackModelId === 'string' ? runtime.fallbackModelId : null,
  };
};
