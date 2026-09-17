import { describe, expect, it, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import {
  assertBrokerConfig,
  assertReplayTopology,
  INSECURE_SIGNING_KEY_FALLBACK,
  resolveBrokerConfig,
} from '../src/broker-config.js';
import { buildCodexBrokerApp } from '../src/server.js';

describe('broker fail-closed config (V4.1 Phase 8, tasks 8.1-8.3a)', () => {
  it('dev without a key resolves an ephemeral key (never the insecure literal)', () => {
    const cfg = resolveBrokerConfig({});
    expect(cfg.signingKey).toBeDefined();
    expect(cfg.signingKey).not.toBe(INSECURE_SIGNING_KEY_FALLBACK);
    expect(cfg.signingKey.length).toBeGreaterThanOrEqual(32);
    expect(cfg.isProduction).toBe(false);
  });

  it('production without a signing key fails closed', () => {
    const cfg = resolveBrokerConfig({ NODE_ENV: 'production' });
    expect(() => assertBrokerConfig(cfg)).toThrow(/signing.key/i);
  });

  it('production with the insecure fallback literal fails closed', () => {
    const cfg = resolveBrokerConfig({
      NODE_ENV: 'production',
      CODEX_SIGNING_KEY: INSECURE_SIGNING_KEY_FALLBACK,
    });
    expect(() => assertBrokerConfig(cfg)).toThrow(/signing.key/i);
  });

  it('production with a short key fails closed', () => {
    const cfg = resolveBrokerConfig({ NODE_ENV: 'production', CODEX_SIGNING_KEY: 'short' });
    expect(() => assertBrokerConfig(cfg)).toThrow(/signing.key/i);
  });

  it('production without Cloudflare Access creds and without explicit trust fails closed', () => {
    const cfg = resolveBrokerConfig({
      NODE_ENV: 'production',
      CODEX_SIGNING_KEY: 'a-strong-signing-key-with-32-plus-chars!!',
    });
    expect(() => assertBrokerConfig(cfg)).toThrow(/cloudflare access|trust/i);
  });

  it('production with explicit BROKER_TRUST_PRIVATE_NETWORK=1 starts without creds', () => {
    const cfg = resolveBrokerConfig({
      NODE_ENV: 'production',
      CODEX_SIGNING_KEY: 'a-strong-signing-key-with-32-plus-chars!!',
      BROKER_TRUST_PRIVATE_NETWORK: '1',
    });
    expect(() => assertBrokerConfig(cfg)).not.toThrow();
    expect(cfg.trustPrivateNetwork).toBe(true);
  });

  it('production with Cloudflare Access creds starts without the trust flag', () => {
    const cfg = resolveBrokerConfig({
      NODE_ENV: 'production',
      CODEX_SIGNING_KEY: 'a-strong-signing-key-with-32-plus-chars!!',
      CF_ACCESS_CLIENT_ID: 'id',
      CF_ACCESS_CLIENT_SECRET: 'secret',
    });
    expect(() => assertBrokerConfig(cfg)).not.toThrow();
  });

  it('replay: singleton with in-memory store is accepted', () => {
    expect(() =>
      assertReplayTopology({ instanceCount: 1, storeKind: 'memory', sharedReplayConfigured: false }),
    ).not.toThrow();
  });

  it('replay: horizontal scale with in-memory store fails closed', () => {
    expect(() =>
      assertReplayTopology({ instanceCount: 3, storeKind: 'memory', sharedReplayConfigured: false }),
    ).toThrow(/replay|shared|scale/i);
  });

  it('replay: horizontal scale with shared replay storage is accepted', () => {
    expect(() =>
      assertReplayTopology({ instanceCount: 3, storeKind: 'memory', sharedReplayConfigured: true }),
    ).not.toThrow();
  });
});

describe('Cloudflare Access fail-closed at request time', () => {
  const apps: FastifyInstance[] = [];
  const authPaths: string[] = [];

  const build = (opts: { isProduction?: boolean; trustPrivateNetwork?: boolean }): FastifyInstance => {
    const path = join(tmpdir(), `broker-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(path, JSON.stringify({ accessToken: 'x', expiresAt: Date.now() + 3600_000 }), {
      encoding: 'utf8',
      mode: 0o600,
    });
    authPaths.push(path);
    const app = buildCodexBrokerApp({
      authCachePath: path,
      signingKey: 'a-strong-signing-key-with-32-plus-chars!!',
      isProduction: opts.isProduction,
      trustPrivateNetwork: opts.trustPrivateNetwork,
    });
    apps.push(app);
    return app;
  };

  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
    for (const p of authPaths.splice(0)) if (existsSync(p)) unlinkSync(p);
  });

  it('production without creds denies protected routes (no implicit trust)', async () => {
    const app = build({ isProduction: true });
    const res = await app.inject({ method: 'GET', url: '/auth/status' });
    expect(res.statusCode).toBe(403);
  });

  it('production with explicit trust allows the CF gate (HMAC still enforced downstream)', async () => {
    const app = build({ isProduction: true, trustPrivateNetwork: true });
    const res = await app.inject({ method: 'GET', url: '/auth/status' });
    expect(res.statusCode).toBe(200);
  });

  it('non-production without creds keeps local-dev behavior', async () => {
    const app = build({});
    const res = await app.inject({ method: 'GET', url: '/auth/status' });
    expect(res.statusCode).toBe(200);
  });
});
