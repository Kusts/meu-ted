import { describe, expect, it, vi } from 'vitest';
import {
  authorizeTurnExecution,
  selectRolloutCohort,
} from '../src/llm/rollout.js';
import type { RuntimeSnapshot } from '../src/llm/runtime-config-client.js';

const SNAP = {
  intention_id: 'intent-1',
  version: 3,
  provider_id: 'zen',
  model_id: 'zen:model-a',
  protocol: 'chat-completions',
  rollout_percentage: 100,
  security_epoch: 7,
  fallback_provider_id: 'go',
  fallback_model_id: 'go:model-b',
  model_name: 'model-a',
  fallback_model_name: 'model-b',
  created_at: '2026-09-07T00:00:00.000Z',
};

const config = (overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot => ({
  version: 3,
  securityEpoch: 7,
  activeProviderId: 'zen',
  activeModelId: 'zen:model-a',
  activeProtocol: 'chat-completions',
  activeRolloutPercentage: 100,
  activeRolloutMode: 'all',
  canaryAllowlist: [],
  fallbackProviderId: 'go',
  fallbackModelId: 'go:model-b',
  activeModelName: 'model-a',
  fallbackModelName: 'model-b',
  ...overrides,
});

describe('H-03: rollout/canary/epoch aplicados no executor', () => {
  it('all: mantém o par ativo', async () => {
    const eff = await authorizeTurnExecution({
      snapshot: { ...SNAP },
      workspaceId: 'ws-1',
      actorId: 'actor-1',
      intentionId: 'intent-1',
      fetchConfig: async () => config(),
    });
    expect(eff.provider_id).toBe('zen');
    expect(eff.model_id).toBe('zen:model-a');
  });

  it('disabled: bloqueia novas inferências (fail-closed)', async () => {
    const err = await authorizeTurnExecution({
      snapshot: { ...SNAP },
      workspaceId: 'ws-1',
      actorId: 'actor-1',
      intentionId: 'intent-1',
      fetchConfig: async () => config({ activeRolloutMode: 'disabled', activeRolloutPercentage: 0 }),
    }).catch((e) => e);
    expect(err).toMatchObject({ code: 'agent.provider_not_configured', status: 503 });
  });

  it('canary: membro da allowlist usa o ativo; fora dela cai para o fallback', async () => {
    const base = {
      snapshot: { ...SNAP },
      actorId: 'actor-1',
      intentionId: 'intent-1',
      fetchConfig: async () =>
        config({ activeRolloutMode: 'canary', activeRolloutPercentage: 0, canaryAllowlist: ['ws-canary'] }),
    };
    const inCohort = await authorizeTurnExecution({ ...base, workspaceId: 'ws-canary' });
    expect(inCohort.provider_id).toBe('zen');

    const outCohort = await authorizeTurnExecution({ ...base, workspaceId: 'ws-other' });
    expect(outCohort.provider_id).toBe('go');
    expect(outCohort.model_name).toBe('model-b');
    // Fallback promovido não tenta fallback de novo.
    expect(outCohort.fallback_provider_id).toBeNull();
  });

  it('canary com allowlist vazia e 0%: ninguém no canário (fail-closed para o fallback)', async () => {
    const eff = await authorizeTurnExecution({
      snapshot: { ...SNAP },
      workspaceId: 'ws-1',
      actorId: 'actor-1',
      intentionId: 'intent-1',
      fetchConfig: async () => config({ activeRolloutMode: 'canary', activeRolloutPercentage: 0, canaryAllowlist: [] }),
    });
    expect(eff.provider_id).toBe('go');
  });

  it('canary sem fallback usável fora da coorte: falha fechado', async () => {
    const err = await authorizeTurnExecution({
      snapshot: { ...SNAP, fallback_provider_id: null, fallback_model_id: null, fallback_model_name: null },
      workspaceId: 'ws-other',
      actorId: 'actor-1',
      intentionId: 'intent-1',
      fetchConfig: async () => config({ activeRolloutMode: 'canary', activeRolloutPercentage: 0, canaryAllowlist: [] }),
    }).catch((e) => e);
    expect(err).toMatchObject({ code: 'agent.provider_not_configured', status: 503 });
  });

  it('epoch incrementado durante a requisição: aborta e invalida o snapshot', async () => {
    const deleteCached = vi.fn();
    const err = await authorizeTurnExecution({
      snapshot: { ...SNAP },
      workspaceId: 'ws-1',
      actorId: 'actor-1',
      intentionId: 'intent-1',
      fetchConfig: async () => config({ securityEpoch: 8 }),
      deleteCachedSnapshot: deleteCached,
    }).catch((e) => e);
    expect(err).toMatchObject({ code: 'agent.security_epoch_changed' });
    expect(deleteCached).toHaveBeenCalledTimes(1);
  });

  it('H-14: falha ao consultar a autoridade nega o turno (fail-closed, 503)', async () => {
    const onUnreachable = vi.fn();
    const err = await authorizeTurnExecution({
      snapshot: { ...SNAP },
      workspaceId: 'ws-1',
      actorId: 'actor-1',
      intentionId: 'intent-1',
      fetchConfig: async () => {
        throw new Error('api down');
      },
      onAuthorityUnreachable: onUnreachable,
    }).catch((e) => e);
    expect(err).toMatchObject({ code: 'agent.provider_not_configured', status: 503 });
    expect(onUnreachable).toHaveBeenCalledTimes(1);
  });

  it('modo desconhecido falha fechado', async () => {
    const err = await authorizeTurnExecution({
      snapshot: { ...SNAP },
      workspaceId: 'ws-1',
      actorId: 'actor-1',
      intentionId: 'intent-1',
      fetchConfig: async () => config({ activeRolloutMode: 'unknown-mode' as never }),
    }).catch((e) => e);
    expect(err).toMatchObject({ code: 'agent.provider_not_configured', status: 503 });
  });

  it('selectRolloutCohort é determinístico e respeita 0%/100%', () => {
    const input = {
      mode: 'canary' as const,
      percentage: 50,
      allowlist: [] as string[],
      workspaceId: 'ws-1',
      actorId: 'actor-1',
      intentionId: 'intent-1',
    };
    expect(selectRolloutCohort(input)).toBe(selectRolloutCohort(input));
    expect(selectRolloutCohort({ ...input, percentage: 100 })).toBe(true);
    expect(selectRolloutCohort({ ...input, percentage: 0 })).toBe(false);
    expect(selectRolloutCohort({ ...input, percentage: 0, allowlist: ['actor-1'] })).toBe(true);
    expect(selectRolloutCohort({ ...input, percentage: 0, allowlist: ['ws-1'] })).toBe(true);
  });
});
