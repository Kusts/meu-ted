import { describe, it, expect, afterAll } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

describe('server smoke', () => {
  const { app } = buildTestApp();

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('GET /health exposes release identity with dev fallbacks (V4.1 Task 9.9)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    for (const field of ['gitSha', 'buildId', 'builtAt']) {
      expect(typeof body[field]).toBe('string');
      expect((body[field] as string).length).toBeGreaterThan(0);
    }
    // Untouched dev env → explicit dev fallbacks, never empty/undefined.
    expect(body.gitSha).toBe(process.env.BUILD_SHA ?? 'dev');
    expect(body.buildId).toBe(process.env.BUILD_ID ?? 'dev');
    expect(body.builtAt).toBe(process.env.BUILD_TIME ?? 'dev');
  });

  it('end-to-end: device → me → accounts → categories → transactions → dashboard → insights', async () => {
    const me = await app.inject({ method: 'GET', url: '/auth/devices/me', headers: { 'x-device-token': TOKEN_A } });
    expect(me.statusCode).toBe(200);

    const accounts = await app.inject({ method: 'GET', url: '/accounts', headers: { 'x-device-token': TOKEN_A } });
    expect(accounts.statusCode).toBe(200);

    const categories = await app.inject({ method: 'GET', url: '/categories', headers: { 'x-device-token': TOKEN_A } });
    expect(categories.statusCode).toBe(200);

    const tx = await app.inject({ method: 'GET', url: '/transactions', headers: { 'x-device-token': TOKEN_A } });
    expect(tx.statusCode).toBe(200);

    const dash = await app.inject({ method: 'GET', url: '/dashboard/summary', headers: { 'x-device-token': TOKEN_A } });
    expect(dash.statusCode).toBe(200);

    const insights = await app.inject({ method: 'GET', url: '/insights/quick', headers: { 'x-device-token': TOKEN_A } });
    expect(insights.statusCode).toBe(200);
    expect(Array.isArray(insights.json().items)).toBe(true);
  });
});
