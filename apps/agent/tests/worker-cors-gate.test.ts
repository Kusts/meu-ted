import { describe, expect, it } from 'vitest';
import worker, { EXPECTED_PWA_ORIGIN, PRODUCTION_PWA_ORIGIN, isExpectedPwaOrigin, resolveAllowedOrigins, resolvePwaOrigin } from '../src/worker.js';

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

describe('G3: PWA origin comes from the PWA_ORIGIN binding (DEBT2 allowlist migration)', () => {
  it('uses the pinned expected origin when the binding matches exactly', () => {
    const env = { ...baseEnv, PWA_ORIGIN: EXPECTED_PWA_ORIGIN } as unknown as WorkerEnv;
    expect(resolvePwaOrigin(env)).toBe(EXPECTED_PWA_ORIGIN);
    expect(resolveAllowedOrigins(env)).toEqual([EXPECTED_PWA_ORIGIN]);
  });

  it('accepts the exact origin with a trailing slash (normalized to canonical)', () => {
    const env = { ...baseEnv, PWA_ORIGIN: `${EXPECTED_PWA_ORIGIN}/` } as unknown as WorkerEnv;
    expect(resolvePwaOrigin(env)).toBe(EXPECTED_PWA_ORIGIN);
  });

  it('accepts the documented dev placeholder silently', () => {
    const env = { ...baseEnv, PWA_ORIGIN: PRODUCTION_PWA_ORIGIN } as unknown as WorkerEnv;
    expect(resolvePwaOrigin(env)).toBe(PRODUCTION_PWA_ORIGIN);
  });

  it('falls back to the non-prod placeholder when the binding is missing or blank', () => {
    expect(resolvePwaOrigin(baseEnv)).toBe(PRODUCTION_PWA_ORIGIN);
    const blank = { ...baseEnv, PWA_ORIGIN: '   ' } as unknown as WorkerEnv;
    expect(resolvePwaOrigin(blank)).toBe(PRODUCTION_PWA_ORIGIN);
  });

  it('rejects non-https bindings fail-closed (falls back, never allowlists them)', () => {
    const http = { ...baseEnv, PWA_ORIGIN: EXPECTED_PWA_ORIGIN.replace('https://', 'http://') } as unknown as WorkerEnv;
    expect(resolvePwaOrigin(http)).toBe(PRODUCTION_PWA_ORIGIN);
    expect(resolveAllowedOrigins(http)).not.toContain(http.PWA_ORIGIN);
    const garbage = { ...baseEnv, PWA_ORIGIN: 'not-a-url' } as unknown as WorkerEnv;
    expect(resolvePwaOrigin(garbage)).toBe(PRODUCTION_PWA_ORIGIN);
  });

  it('composes the localhost flag with the pinned PWA origin', () => {
    const env = { ...baseEnv, PWA_ORIGIN: EXPECTED_PWA_ORIGIN, ALLOW_LOCAL_ORIGIN: '1' } as unknown as WorkerEnv;
    const allowed = resolveAllowedOrigins(env);
    expect(allowed).toContain(EXPECTED_PWA_ORIGIN);
    expect(allowed).toContain('http://localhost:3000');
  });

  it('preflight from the configured origin echoes it', async () => {
    const env = { ...baseEnv, PWA_ORIGIN: EXPECTED_PWA_ORIGIN } as unknown as WorkerEnv;
    const res = await worker.fetch(
      new Request('https://worker.test/health', {
        method: 'OPTIONS',
        headers: { origin: EXPECTED_PWA_ORIGIN },
      }),
      env,
    );
    expect(res.headers.get('access-control-allow-origin')).toBe(EXPECTED_PWA_ORIGIN);
  });
});

describe('isExpectedPwaOrigin (DEBT2-CODER-ALLOWLISTS-FIX strict pin)', () => {
  it('accepts the exact expected origin (and trailing-slash form)', () => {
    expect(isExpectedPwaOrigin(EXPECTED_PWA_ORIGIN)).toBe(true);
    expect(isExpectedPwaOrigin(`${EXPECTED_PWA_ORIGIN}/`)).toBe(true);
  });

  it('rejects scheme downgrade, userinfo, ports, paths, queries, fragments', () => {
    expect(isExpectedPwaOrigin(EXPECTED_PWA_ORIGIN.replace('https://', 'http://'))).toBe(false);
    expect(isExpectedPwaOrigin(EXPECTED_PWA_ORIGIN.replace('https://', 'https://user:pass@'))).toBe(false);
    expect(isExpectedPwaOrigin(`${EXPECTED_PWA_ORIGIN}:8443`)).toBe(false);
    expect(isExpectedPwaOrigin(`${EXPECTED_PWA_ORIGIN}/app`)).toBe(false);
    expect(isExpectedPwaOrigin(`${EXPECTED_PWA_ORIGIN}?q=1`)).toBe(false);
    expect(isExpectedPwaOrigin(`${EXPECTED_PWA_ORIGIN}#h`)).toBe(false);
  });

  it('rejects external and lookalike hosts', () => {
    expect(isExpectedPwaOrigin('https://pwa.example.net')).toBe(false);
    expect(isExpectedPwaOrigin(`https://${new URL(EXPECTED_PWA_ORIGIN).hostname}.evil.example`)).toBe(false);
    expect(isExpectedPwaOrigin(EXPECTED_PWA_ORIGIN.replace('https://', 'https://user@'))).toBe(false);
  });

  it('never allowlists a rejected binding', () => {
    for (const bad of [
      'https://pwa.example.net',
      `${EXPECTED_PWA_ORIGIN}/app`,
      EXPECTED_PWA_ORIGIN.replace('https://', 'http://'),
    ]) {
      const env = { ...baseEnv, PWA_ORIGIN: bad } as unknown as WorkerEnv;
      expect(resolveAllowedOrigins(env)).not.toContain(bad);
      expect(resolveAllowedOrigins(env)).toEqual([PRODUCTION_PWA_ORIGIN]);
    }
  });
});
