import { internalSnapshotSchema } from '@pi-finance/llm-contracts/schemas';
import type { RuntimeSnapshot } from '@pi-finance/llm-contracts/types';

export type { RuntimeSnapshot };

export class RuntimeSnapshotError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly excerpt: string,
  ) {
    super(message);
    this.name = 'RuntimeSnapshotError';
  }
}

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

  const rawText = await res.text().catch(() => '');
  let data: unknown = null;
  try {
    data = rawText ? (JSON.parse(rawText) as unknown) : null;
  } catch {
    data = null;
  }
  const parsed = internalSnapshotSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
    throw new RuntimeSnapshotError(
      `Invalid runtime snapshot${where}: ${issue?.message ?? 'parse failed'}`,
      res.status,
      rawText.slice(0, 200),
    );
  }

  // The schema is the contract: no defensive re-reads of legacy names or slots.
  const runtime = parsed.data.runtime;
  return {
    version: runtime.version,
    securityEpoch: runtime.securityEpoch,
    activeProviderId: runtime.activeProviderId,
    activeModelId: runtime.activeModelId,
    activeProtocol: runtime.activeProtocol,
    activeRolloutPercentage: runtime.activeRolloutPercentage,
    fallbackProviderId: runtime.fallbackProviderId,
    fallbackModelId: runtime.fallbackModelId,
  };
};
