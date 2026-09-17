import { describe, expect, it } from 'vitest';
import worker from '../src/worker.js';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

const baseEnv = { API_ORIGIN: 'https://api.example.test' } as unknown as WorkerEnv;

describe('V4.1 Task 9.9: agent /health exposes release identity', () => {
  it('returns schemaVersion plus dev fallbacks when no build env is set', async () => {
    const res = await worker.fetch(new Request('https://worker.test/health'), baseEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ready');
    expect(body.schemaVersion).toBe(5);
    expect(body.buildSha).toBe('dev');
    expect(body.buildId).toBe('dev');
    expect(body.builtAt).toBe('dev');
  });

  it('reflects injected BUILD_* env when present', async () => {
    const env = {
      ...baseEnv,
      BUILD_SHA: 'abc123def456',
      BUILD_ID: '12345',
      BUILD_TIME: '2026-09-17T00:00:00Z',
    } as unknown as WorkerEnv;
    const res = await worker.fetch(new Request('https://worker.test/health'), env);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.buildSha).toBe('abc123def456');
    expect(body.buildId).toBe('12345');
    expect(body.builtAt).toBe('2026-09-17T00:00:00Z');
  });
});
