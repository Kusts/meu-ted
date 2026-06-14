import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

describe('CORS', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  const OLD = process.env.CORS_ORIGIN;

  beforeEach(() => { app = buildTestApp().app; });
  afterAll(() => { process.env.CORS_ORIGIN = OLD; });

  it('returns Access-Control-Allow-Origin from CORS_ORIGIN env', async () => {
    process.env.CORS_ORIGIN = 'https://pi.example.com';
    const app2 = buildTestApp().app;
    const res = await app2.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://pi.example.com', 'access-control-request-method': 'GET' } });
    expect(res.headers['access-control-allow-origin']).toBe('https://pi.example.com');
  });

  it('allows credentialed requests', async () => {
    process.env.CORS_ORIGIN = 'https://pi.example.com';
    const app2 = buildTestApp().app;
    const res = await app2.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://pi.example.com', 'access-control-request-method': 'GET' } });
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows X-Device-Token and Idempotency-Key headers', async () => {
    process.env.CORS_ORIGIN = 'https://pi.example.com';
    const app2 = buildTestApp().app;
    const res = await app2.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://pi.example.com', 'access-control-request-method': 'POST' } });
    const h = (res.headers['access-control-allow-headers'] as string ?? '').toLowerCase();
    expect(h).toContain('x-device-token');
    expect(h).toContain('idempotency-key');
  });

  it('does not add CORS when origin not configured', async () => {
    delete process.env.CORS_ORIGIN;
    const app2 = buildTestApp().app;
    const res = await app2.inject({ method: 'OPTIONS', url: '/transactions' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns 204 for preflight requests', async () => {
    process.env.CORS_ORIGIN = 'https://pi.example.com';
    const app2 = buildTestApp().app;
    const res = await app2.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://pi.example.com', 'access-control-request-method': 'GET' } });
    expect(res.statusCode).toBe(204);
  });
});
