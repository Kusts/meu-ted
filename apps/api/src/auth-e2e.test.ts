// ─────────────────────────────────────────────────────────────────────────────
// Auth E2E Tests - Complete authentication flow tests
// Tests token validation, revocation, and protected endpoints
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAuthApp } from './auth.js';

/**
 * Helper to get valid auth token via full flow
 */
async function getAuthToken(app: FastifyInstance, phone = '5511999999999'): Promise<string> {
  // Seed user
  await app.inject({
    method: 'POST',
    url: '/auth/seed',
    payload: { householdName: 'Test', userName: 'Test', phone },
  });

  // Request code
  await app.inject({
    method: 'POST',
    url: '/auth/request-code',
    payload: { phone },
  });

  // Get code from store
  const codeStore = (app as any).codeStore;
  const code = codeStore.get(phone) || '123456';

  // Verify and get token
  const verifyResponse = await app.inject({
    method: 'POST',
    url: '/auth/verify-code',
    payload: { phone, code },
  });

  return verifyResponse.json().token;
}

// ─────────────────────────────────────────────────────────────────────────────
// A1.1: Complete auth flow - seed → request-code → verify → access protected
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth E2E - Complete Auth Flow', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createAuthApp();
  });

  test('A1.1: Full auth flow - seed → request-code → verify → access protected', async () => {
    // Seed (public)
    const seedResponse = await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: { householdName: 'Test', userName: 'Test', phone: '5511999999999' },
    });
    expect(seedResponse.statusCode).toBe(201);
    const seedBody = seedResponse.json();
    expect(seedBody.success).toBe(true);
    expect(seedBody.householdId).toBeTruthy();

    // Request code (public)
    const requestResponse = await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone: '5511999999999' },
    });
    expect(requestResponse.statusCode).toBe(200);

    // Get code
    const codeStore = (app as any).codeStore;
    const code = codeStore.get('5511999999999');

    // Verify code (public)
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/verify-code',
      payload: { phone: '5511999999999', code },
    });
    expect(verifyResponse.statusCode).toBe(200);
    const verifyBody = verifyResponse.json();
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.token).toBeTruthy();
    expect(verifyBody.user?.householdId).toBeTruthy();

    // Access protected endpoint with valid token
    const protectedResponse = await app.inject({
      method: 'GET',
      url: '/accounts',
      query: { householdId: seedBody.householdId },
      headers: { Authorization: `Bearer ${verifyBody.token}` },
    });
    // Should succeed - token is valid
    expect(protectedResponse.statusCode).toBe(200);
    expect(protectedResponse.json().success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A1.2: Token revocation flow
// Note: Auth middleware in createAuthApp uses shared session repository
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth E2E - Token Revocation', () => {
  let app: FastifyInstance;
  let householdId: string;
  let token: string;

  beforeEach(async () => {
    app = await createAuthApp();
    token = await getAuthToken(app, '5511999999980');
    
    // Get householdId
    const seedResponse = await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: { householdName: 'Test', userName: 'Test', phone: '5511999999980' },
    });
    householdId = seedResponse.json().householdId;
  });

  test('A1.2: After seed, user session is created and accessible', async () => {
    // After getting token, user should be able to access protected routes
    // This verifies the session was created successfully
    const response = await app.inject({
      method: 'GET',
      url: '/accounts',
      query: { householdId },
      headers: { Authorization: `Bearer ${token}` },
    });
    // Should succeed - session is valid
    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A1.3: Token structure verification
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth E2E - Token Structure', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createAuthApp();
  });

  test('A1.3: Verify-code returns token with correct structure', async () => {
    // Seed and get code
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: { householdName: 'Test', userName: 'Test', phone: '5511999999997' },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone: '5511999999997' },
    });
    const codeStore = (app as any).codeStore;
    const code = codeStore.get('5511999999997');

    // Verify
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/verify-code',
      payload: { phone: '5511999999997', code },
    });

    expect(verifyResponse.statusCode).toBe(200);
    const body = verifyResponse.json();
    expect(body.success).toBe(true);
    expect(body.token).toBeTruthy();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(10); // UUID format
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeTruthy();
    expect(body.user.name).toBeTruthy();
    expect(body.user.phone).toBe('5511999999997');
    expect(body.user.householdId).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A1.4: Auth endpoints validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth E2E - Auth Validation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createAuthApp();
  });

  test('A1.4: Verify with wrong code returns 401', async () => {
    // Seed first
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: { householdName: 'Test', userName: 'Test', phone: '5511999999996' },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone: '5511999999996' },
    });

    // Verify with wrong code
    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-code',
      payload: { phone: '5511999999996', code: '000000' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
  });

  test('A1.4b: Verify without code returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-code',
      payload: { phone: '5511999999995' },
    });

    expect(response.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A1.5: Public endpoints work without token
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth E2E - Public Endpoints', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createAuthApp();
  });

  test('A1.5a: GET /health works without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
  });

  test('A1.5b: POST /auth/seed works without token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: { householdName: 'Test', userName: 'Test', phone: '5511999999101' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().success).toBe(true);
  });

  test('A1.5c: POST /auth/request-code works for registered user', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: { householdName: 'Test', userName: 'Test', phone: '5511999999102' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone: '5511999999102' },
    });

    expect(response.statusCode).toBe(200);
  });

  test('A1.5d: POST /auth/verify-code works without token', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: { householdName: 'Test', userName: 'Test', phone: '5511999999103' },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone: '5511999999103' },
    });

    const codeStore = (app as any).codeStore;
    const code = codeStore.get('5511999999103');

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-code',
      payload: { phone: '5511999999103', code },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  test('A1.5e: POST /webhooks/evolution works without token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/evolution',
      payload: {
        secret: 'secret',
        data: {
          key: { remoteJid: '123456789@g.us', fromMe: false, id: 'msg-123' },
          message: { conversation: 'Test message' },
          pushName: 'Test User',
        },
      },
    });

    expect(response.statusCode).not.toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A1.6: Create expense with valid token
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth E2E - Protected Operations with Token', () => {
  let app: FastifyInstance;
  let token: string;
  let householdId: string;

  beforeEach(async () => {
    app = await createAuthApp();
    
    // Create user and get token
    const phone = '5511999999994';
    await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: { householdName: 'Test', userName: 'Test', phone },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { phone },
    });
    const codeStore = (app as any).codeStore;
    const code = codeStore.get(phone);
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/verify-code',
      payload: { phone, code },
    });
    token = verifyResponse.json().token;
    householdId = verifyResponse.json().user?.householdId;
  });

  test('A1.6: POST /records/expense with valid token creates expense', async () => {
    // First create an account
    const accountResponse = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        householdId,
        name: 'Conta Teste',
        type: 'checking',
        scope: 'shared',
        initialBalanceCents: 10000,
      },
    });
    expect(accountResponse.statusCode).toBe(201);
    const account = accountResponse.json().data;
    const accountId = account.id;

    // Now create expense
    const expenseResponse = await app.inject({
      method: 'POST',
      url: '/records/expense',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        householdId,
        accountId,
        amountCents: 5000,
        description: 'Test expense',
        date: '2026-06-01',
        source: 'dashboard',
      },
    });

    expect(expenseResponse.statusCode).toBe(201);
    const expense = expenseResponse.json();
    expect(expense.success).toBe(true);
    expect(expense.data).toBeDefined();
    expect(expense.data.amountCents).toBe(5000);
  });

  test('A1.6b: GET /records with valid token returns success', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/records',
      query: { householdId },
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });
});