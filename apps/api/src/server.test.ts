// ─────────────────────────────────────────────────────────────────────────────
// Server Tests - Startup and Seed behavior
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';
import { registerAuthRoutes } from './auth.js';

describe('Server Seed Behavior', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    app = createApp({
      instanceToken: 'test-secret',
      allowedGroupIds: [],
      registeredPhones: [],
    });
    await registerAuthRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  test('seed creates household and user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Test House',
        userName: 'Test User',
        phone: '5511888888888',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.householdId).toBeTruthy();
    expect(body.userId).toBeTruthy();
  });

  test('seed is idempotent - second call returns existing', async () => {
    // First call
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Test House',
        userName: 'Test User',
        phone: '5511777777777',
      },
    });

    // Second call - should be idempotent
    const response = await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Test House',
        userName: 'Test User',
        phone: '5511777777777',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.idempotent).toBe(true);
  });

  test('seed uses default phone when not provided in body', async () => {
    // Empty payload should use default phone
    const response = await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: 'Test',
        userName: 'Test',
        // No phone - should use default
      },
    });

    // Route provides default phone when not provided
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
  });

  test('seed without householdName and userName uses defaults', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        phone: '5511555555555',
        // No householdName or userName
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
  });
});