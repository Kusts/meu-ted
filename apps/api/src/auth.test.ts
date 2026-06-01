// ─────────────────────────────────────────────────────────────────────────────
// Auth Routes tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAuthApp } from './auth.js';

describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createAuthApp();
  });

  test('POST /auth/seed creates household and user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Família Silva',
        userName: 'João',
        phone: '5511999999999',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.householdId).toBeTruthy();
    expect(body.userId).toBeTruthy();
  });

  test('POST /auth/seed idempotent - second call returns existing', async () => {
    // First seed
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Família Silva',
        userName: 'João',
        phone: '5511999999999',
      },
    });

    // Second seed - should return existing
    const response = await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Família Silva',
        userName: 'João',
        phone: '5511999999999',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.idempotent).toBe(true);
  });

  test('POST /auth/request-code returns 404 for unknown phone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone: '5511888888888' },
    });

    expect(response.statusCode).toBe(404);
  });

  test('POST /auth/request-code returns 200 for registered phone', async () => {
    // Seed first
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Test',
        userName: 'Test',
        phone: '5511999999999',
      },
    });

    // Request code
    const response = await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone: '5511999999999' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  test('POST /auth/verify-code returns token for valid code', async () => {
    // Seed
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Test',
        userName: 'Test',
        phone: '5511999999999',
      },
    });

    // Get the code from the mock code store (don't need response body)
    await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone: '5511999999999' },
    });

    // Get the actual code from the app's code store (test only)
    const codeStore = (app as any).codeStore;
    const code = codeStore.get('5511999999999');

    // Verify
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/verify-code',
      payload: { phone: '5511999999999', code },
    });

    expect(verifyResponse.statusCode).toBe(200);
    const body = verifyResponse.json();
    expect(body.success).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.user).toBeTruthy();
  });

  test('POST /auth/verify-code returns 401 for invalid code', async () => {
    // Seed
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Test',
        userName: 'Test',
        phone: '5511999999999',
      },
    });

    // Request code to create one
    await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone: '5511999999999' },
    });

    // Verify with wrong code
    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-code',
      payload: { phone: '5511999999999', code: '000000' },
    });

    expect(response.statusCode).toBe(401);
  });

  test('protected route works with valid token - full auth flow', async () => {
    // Seed first (public endpoint)
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Test',
        userName: 'Test',
        phone: '5511999999999',
      },
    });

    // Request code (public endpoint)
    await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone: '5511999999999' },
    });

    // Get code from store
    const codeStore = (app as any).codeStore;
    const code = codeStore?.get('5511999999999');

    // Verify - get token (public endpoint)
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/verify-code',
      payload: { phone: '5511999999999', code: code || '123456' },
    });

    expect(verifyResponse.statusCode).toBe(200);
    const body = verifyResponse.json();
    expect(body.success).toBe(true);
    expect(body.token).toBeTruthy();

    const token = body.token;

    // Now access protected endpoint with token
    const protectedResponse = await app.inject({
      method: 'GET',
      url: '/accounts',
      query: { householdId: 'test' },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Should work now (200 or 400 for missing account, but not 401)
    expect(protectedResponse.statusCode).not.toBe(401);
  });
});