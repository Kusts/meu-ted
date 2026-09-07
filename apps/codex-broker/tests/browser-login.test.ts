import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCodexBrokerApp } from '../src/server.js';
import type { FastifyInstance } from 'fastify';

describe('Codex broker browser login (refactor item 6)', () => {
  let app: FastifyInstance;
  let testAuthPath: string;
  const SIGNING_KEY = 'test-signing-key-at-least-32-chars-long!';
  const CF_ID = 'test-cf-client-id';
  const CF_SECRET = 'test-cf-client-secret';
  const cfHeaders = { 'cf-access-client-id': CF_ID, 'cf-access-client-secret': CF_SECRET };

  beforeEach(async () => {
    testAuthPath = join(tmpdir(), `test-codex-login-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    app = buildCodexBrokerApp({
      authCachePath: testAuthPath,
      signingKey: SIGNING_KEY,
      cfAccessClientId: CF_ID,
      cfAccessClientSecret: CF_SECRET,
      codeExchange: async (code: string) => ({
        accessToken: `exchanged-token-for-${code.slice(0, 8)}`,
        expiresIn: 3600,
        email: 'subscriber@example.com',
      }),
    });
  });

  afterEach(async () => {
    await app.close();
    if (existsSync(testAuthPath)) unlinkSync(testAuthPath);
  });

  it('POST /auth/login returns a browser verification payload without secrets', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { ...cfHeaders, 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.verificationUri).toContain('https://');
    expect(body.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(typeof body.state).toBe('string');
    expect(JSON.stringify(body)).not.toContain('token');
  });

  it('POST /auth/callback with unknown state is rejected without touching the cache', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/callback',
      headers: { ...cfHeaders, 'content-type': 'application/json' },
      payload: { code: 'some-oauth-code', state: 'deadbeefdeadbeefdeadbeefdeadbeef' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'login_unknown_state' });
    expect(existsSync(testAuthPath)).toBe(false);
  });

  it('callback persists the exchanged session atomically and never echoes the token', async () => {
    const begin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { ...cfHeaders, 'content-type': 'application/json' },
      payload: {},
    });
    const { state } = begin.json() as { state: string };

    const done = await app.inject({
      method: 'POST',
      url: '/auth/callback',
      headers: { ...cfHeaders, 'content-type': 'application/json' },
      payload: { code: 'oauth-code-1234', state },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ ok: true, email: 'subscriber@example.com' });
    // The token lives only in the 0600 cache file — never in the response.
    expect(JSON.stringify(done.json())).not.toContain('exchanged-token');

    const raw = JSON.parse(readFileSync(testAuthPath, 'utf8')) as { accessToken?: string };
    expect(raw.accessToken).toContain('exchanged-token');

    const status = await app.inject({ method: 'GET', url: '/auth/status', headers: cfHeaders });
    expect(status.statusCode).toBe(200);
    expect(status.json().auth).toMatchObject({ authenticated: true, reauthRequired: false });
    expect(JSON.stringify(status.json())).not.toContain('exchanged-token');
  });

  it('callback without a configured exchange fails closed (502)', async () => {
    const bare = buildCodexBrokerApp({
      authCachePath: join(tmpdir(), `test-codex-noex-${Date.now()}.json`),
      signingKey: SIGNING_KEY,
    });
    try {
      const begin = await bare.inject({ method: 'POST', url: '/auth/login', payload: {} });
      const { state } = begin.json() as { state: string };
      const done = await bare.inject({
        method: 'POST',
        url: '/auth/callback',
        headers: { 'content-type': 'application/json' },
        payload: { code: 'oauth-code-1234', state },
      });
      expect(done.statusCode).toBe(502);
      expect(done.json()).toMatchObject({ error: 'login_exchange_failed' });
    } finally {
      await bare.close();
    }
  });
});
