import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { buildTestApp } from '../test-app.js';

describe('CORS', () => {
  const OLD = process.env.CORS_ORIGIN;

  afterEach(() => { delete process.env.CORS_ORIGIN; });
  afterAll(() => { process.env.CORS_ORIGIN = OLD; });

  // ── single origin (backward compat) ──

  it('echoes matching single origin', async () => {
    process.env.CORS_ORIGIN = 'https://pi.example.com';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://pi.example.com', 'access-control-request-method': 'GET' } });
    expect(res.headers['access-control-allow-origin']).toBe('https://pi.example.com');
  });

  it('does not echo non-matching single origin', async () => {
    process.env.CORS_ORIGIN = 'https://pi.example.com';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://evil.com', 'access-control-request-method': 'GET' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  // ── multiple origins (comma-separated) ──

  it('echoes matching origin from comma-separated list', async () => {
    process.env.CORS_ORIGIN = 'http://localhost:5173,https://pi-finance-web.pages.dev';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://localhost:5173' } });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('echoes second origin from comma-separated list', async () => {
    process.env.CORS_ORIGIN = 'http://localhost:5173,https://pi-finance-web.pages.dev';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://pi-finance-web.pages.dev', 'access-control-request-method': 'GET' } });
    expect(res.headers['access-control-allow-origin']).toBe('https://pi-finance-web.pages.dev');
  });

  it('does not echo origin not in list', async () => {
    process.env.CORS_ORIGIN = 'http://localhost:5173,https://pi-finance-web.pages.dev';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://evil.com' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('trims whitespace around origins', async () => {
    process.env.CORS_ORIGIN = ' http://localhost:5173 , https://pi.example.com ';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://localhost:5173' } });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  // ── credentials ──

  it('sets credentials=true when origin matches', async () => {
    process.env.CORS_ORIGIN = 'http://localhost:5173,https://pi-finance-web.pages.dev';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://pi-finance-web.pages.dev', 'access-control-request-method': 'GET' } });
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not set credentials when origin not in list', async () => {
    process.env.CORS_ORIGIN = 'https://pi.example.com';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://evil.com' } });
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  // ── preflight headers ──

  it('allows X-Device-Token and Idempotency-Key headers in preflight', async () => {
    process.env.CORS_ORIGIN = 'https://pi.example.com';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://pi.example.com', 'access-control-request-method': 'POST' } });
    const h = (res.headers['access-control-allow-headers'] as string ?? '').toLowerCase();
    expect(h).toContain('x-device-token');
    expect(h).toContain('idempotency-key');
  });

  // ── no CORS when not configured ──

  it('does not add CORS when origin not configured', async () => {
    delete process.env.CORS_ORIGIN;
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'OPTIONS', url: '/transactions' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows local PWA origins by default in development', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGIN;

    try {
      for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000']) {
        const app = buildTestApp().app;
        const res = await app.inject({
          method: 'GET',
          url: '/health',
          headers: { origin },
        });
        expect(res.headers['access-control-allow-origin']).toBe(origin);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
      }
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('returns 204 for preflight requests with matching origin', async () => {
    process.env.CORS_ORIGIN = 'https://pi.example.com';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://pi.example.com', 'access-control-request-method': 'GET' } });
    expect(res.statusCode).toBe(204);
  });

  it('still responds 204 for preflight even with non-matching origin (no CORS echo)', async () => {
    process.env.CORS_ORIGIN = 'https://pi.example.com';
    const app = buildTestApp().app;
    const res = await app.inject({ method: 'OPTIONS', url: '/transactions', headers: { origin: 'https://evil.com', 'access-control-request-method': 'GET' } });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
