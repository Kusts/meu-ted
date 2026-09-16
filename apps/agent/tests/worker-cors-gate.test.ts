import { describe, expect, it } from 'vitest';
import worker, { PRODUCTION_PWA_ORIGIN, resolveAllowedOrigins } from '../src/worker.js';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

const baseEnv = { API_ORIGIN: 'https://api.example.test' } as unknown as WorkerEnv;

describe('G3: worker CORS allowlist is fail-closed in production (V4 T2.7)', () => {
  it('production env allows only the production PWA origin', () => {
    expect(resolveAllowedOrigins(baseEnv)).toEqual([PRODUCTION_PWA_ORIGIN]);
    expect(resolveAllowedOrigins(baseEnv)).not.toContain('http://localhost:3000');
    expect(resolveAllowedOrigins(baseEnv)).not.toContain('http://127.0.0.1:3001');
  });

  it('localhost joins the allowlist only with the explicit flag', () => {
    const devEnv = { ...baseEnv, ALLOW_LOCAL_ORIGIN: '1' } as unknown as WorkerEnv;
    const allowed = resolveAllowedOrigins(devEnv);
    expect(allowed).toContain(PRODUCTION_PWA_ORIGIN);
    expect(allowed).toContain('http://localhost:3000');
    expect(allowed).toContain('http://127.0.0.1:3000');
    expect(allowed).toContain('http://localhost:3001');
    expect(allowed).toContain('http://127.0.0.1:3001');
  });

  it('production preflight from localhost answers null (browser blocks)', async () => {
    const res = await worker.fetch(
      new Request('https://worker.test/health', {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
      }),
      baseEnv,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('null');
  });

  it('dev preflight from localhost echoes the origin', async () => {
    const devEnv = { ...baseEnv, ALLOW_LOCAL_ORIGIN: '1' } as unknown as WorkerEnv;
    const res = await worker.fetch(
      new Request('https://worker.test/health', {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
      }),
      devEnv,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('production preflight from the PWA origin echoes it', async () => {
    const res = await worker.fetch(
      new Request('https://worker.test/health', {
        method: 'OPTIONS',
        headers: { origin: PRODUCTION_PWA_ORIGIN },
      }),
      baseEnv,
    );
    expect(res.headers.get('access-control-allow-origin')).toBe(PRODUCTION_PWA_ORIGIN);
  });
});
