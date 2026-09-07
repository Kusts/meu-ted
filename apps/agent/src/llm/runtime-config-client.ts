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

export const RUNTIME_CONFIG_TIMEOUT_MS = 5_000;

export const fetchRuntimeConfig = async (
  apiOrigin: string,
  configToken: string,
  opts?: { timeoutMs?: number },
): Promise<RuntimeSnapshot> => {
  if (!apiOrigin || !configToken) {
    throw new Error('apiOrigin and configToken are required to fetch runtime configuration');
  }

  const url = `${apiOrigin.replace(/\/$/, '')}/internal/agent/llm-config`;
  let res: Response;
  try {
    // Fase 3 item 8: bounded fetch so a hung API cannot stall the agent.
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-agent-config-token': configToken,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(opts?.timeoutMs ?? RUNTIME_CONFIG_TIMEOUT_MS),
    });
  } catch (err) {
    // Only the deadline becomes a typed timeout; genuine network errors
    // keep propagating untouched.
    if ((err as { name?: string })?.name !== 'TimeoutError') throw err;
    throw new RuntimeSnapshotError(
      `Runtime snapshot fetch timed out: ${(err as Error)?.message ?? 'timeout'}`,
      0,
      '',
    );
  }

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
  // Double fail-closed (Fase 1b-FIX item 9): the flags win over the ids even
  // though the schema already forces coherence — belt and suspenders at the
  // boundary that decides execution.
  const snapshot = parsed.data;
  const runtime = snapshot.runtime;
  return {
    version: runtime.version,
    securityEpoch: runtime.securityEpoch,
    activeProviderId: snapshot.activeDisabled ? null : runtime.activeProviderId,
    activeModelId: snapshot.activeDisabled ? null : runtime.activeModelId,
    activeProtocol: snapshot.activeDisabled ? null : runtime.activeProtocol,
    activeRolloutPercentage: runtime.activeRolloutPercentage,
    // H-03: mode + allowlist travel to the executor — rollout is enforced
    // per turn, never serialized-only.
    activeRolloutMode: runtime.activeRolloutMode,
    canaryAllowlist: runtime.canaryAllowlist ?? [],
    fallbackProviderId: snapshot.fallbackDisabled ? null : runtime.fallbackProviderId,
    fallbackModelId: snapshot.fallbackDisabled ? null : runtime.fallbackModelId,
    // Fase 3 item 5: bare upstream names come from the validated slots, never
    // by string-splitting the row id (row ids are opaque configuration keys).
    activeModelName: snapshot.activeDisabled ? null : (snapshot.activeModel?.modelId ?? null),
    fallbackModelName: snapshot.fallbackDisabled ? null : (snapshot.fallbackModel?.modelId ?? null),
  };
};
