import { describe, expect, it, vi } from 'vitest';
import {
  executeLlmAttempts,
  resolveAttemptTargets,
} from '../src/llm/attempts.js';

const SNAP = {
  intention_id: 'intent-1',
  version: 3,
  provider_id: 'opencode-zen',
  model_id: 'opencode-zen:muse-spark-1.2-contributor-free',
  protocol: 'chat-completions',
  rollout_percentage: 100,
  security_epoch: 1,
  fallback_provider_id: 'opencode-go',
  fallback_model_id: 'opencode-go:mimo-v2.5-free',
  model_name: null,
  fallback_model_name: null,
  created_at: '2026-09-07T00:00:00.000Z',
} as const;

describe('H-02: unified LLM attempts executor', () => {
  it('resolveAttemptTargets resolve nomes upstream concretos (nunca row ids)', () => {
    const targets = resolveAttemptTargets({ ...SNAP });
    expect(targets.primary).toEqual({
      providerId: 'opencode-zen',
      modelName: 'muse-spark-1.2-contributor-free',
    });
    expect(targets.fallback).toEqual({
      providerId: 'opencode-go',
      modelName: 'mimo-v2.5-free',
    });
  });

  it('resolveAttemptTargets falha fechado em row id opaco e ignora fallback igual ao primário', () => {
    const opaque = resolveAttemptTargets({
      ...SNAP,
      provider_id: 'openai-api',
      model_id: 'row-id-opaco-123',
      model_name: null,
    });
    expect(opaque.primary).toBeNull();

    const same = resolveAttemptTargets({
      ...SNAP,
      fallback_provider_id: 'opencode-zen',
      fallback_model_id: 'opencode-zen:muse-spark-1.2-contributor-free',
      fallback_model_name: null,
    });
    expect(same.primary).not.toBeNull();
    expect(same.fallback).toBeNull();
  });

  it('primary win não toca o fallback', async () => {
    const fallback = vi.fn();
    const outcome = await executeLlmAttempts({
      snapshot: { ...SNAP },
      intentionId: 'intent-1',
      runLeg: async (target) => `ok:${target.providerId}/${target.modelName}`,
    });
    expect(outcome).toMatchObject({ result: 'ok:opencode-zen/muse-spark-1.2-contributor-free', usedFallback: false, failoverReason: null });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falha retryable do primário usa o fallback na mesma requisição (nomes concretos)', async () => {
    const seen: string[] = [];
    const outcome = await executeLlmAttempts({
      snapshot: { ...SNAP },
      intentionId: 'intent-1',
      runLeg: async (target) => {
        seen.push(`${target.providerId}/${target.modelName}`);
        if (target.providerId === 'opencode-zen') {
          throw Object.assign(new Error('Too Many Requests'), { status: 429 });
        }
        return 'fallback-ok';
      },
    });
    expect(seen).toEqual([
      'opencode-zen/muse-spark-1.2-contributor-free',
      'opencode-go/mimo-v2.5-free',
    ]);
    expect(outcome).toMatchObject({ result: 'fallback-ok', usedFallback: true, failoverReason: 'http_429' });
  });

  it('falha não-retryable (400) não tenta fallback', async () => {
    const runLeg = vi.fn(async () => {
      throw Object.assign(new Error('Bad Request'), { status: 400 });
    });
    await expect(
      executeLlmAttempts({ snapshot: { ...SNAP }, intentionId: 'intent-1', runLeg }),
    ).rejects.toMatchObject({ status: 400 });
    expect(runLeg).toHaveBeenCalledTimes(1);
  });

  it('ambas as pernas falham: erro composto sanitizado com as duas razões', async () => {
    const err = await executeLlmAttempts({
      snapshot: { ...SNAP },
      intentionId: 'intent-1',
      runLeg: async (target) => {
        if (target.providerId === 'opencode-zen') {
          throw Object.assign(new Error('Service Unavailable sk-secret-planted'), { status: 503 });
        }
        throw Object.assign(new Error('Gateway Timeout sk-secret-planted'), { status: 504 });
      },
    }).catch((e) => e) as { code?: string; status?: number; message?: string; primaryReason?: string; fallbackReason?: string };
    expect(err.code).toBe('agent.inference_error');
    expect(err.status).toBe(502);
    expect(err.primaryReason).toBe('http_503');
    expect(err.fallbackReason).toBe('http_504');
    expect(String(err.message)).toContain('http_503');
    expect(String(err.message)).toContain('http_504');
    expect(String(err.message)).not.toContain('sk-secret-planted');
  });

  it('snapshot sem primário resolvível falha fechado antes de qualquer attempt', async () => {
    const runLeg = vi.fn(async () => 'never');
    await expect(
      executeLlmAttempts({
        snapshot: { ...SNAP, provider_id: 'openai-api', model_id: 'row-id-opaco', model_name: null },
        intentionId: 'intent-1',
        runLeg,
      }),
    ).rejects.toMatchObject({ code: 'agent.provider_not_configured', status: 503 });
    expect(runLeg).not.toHaveBeenCalled();
  });
});
