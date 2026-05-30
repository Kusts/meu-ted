// ─────────────────────────────────────────────────────────────────────────────
// Categorization Rules API Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach } from 'vitest';
import { createApp } from './app.js';
import { registerAuthRoutes } from './auth.js';
import { registerRulesRoutes } from './routes/rules.js';
import type { CategorizationRule } from '@pi-financeiro/domain';

describe('Categorization Rules API', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let householdId: string;
  let categoryId: string;

  beforeEach(async () => {
    app = createApp({
      webhookSecret: 'test',
      allowedGroupIds: [],
      registeredPhones: [],
    });

    // Seed auth and rules
    await registerAuthRoutes(app);

    householdId = crypto.randomUUID();
    categoryId = crypto.randomUUID();

    // Simple in-memory rule store for tests
    const ruleStore = new Map<string, CategorizationRule>();

    await registerRulesRoutes(app, {
      ruleRepository: {
        async create(rule: CategorizationRule) {
          ruleStore.set(rule.id, rule);
          return { ...rule };
        },
        async findById(id: string) {
          return ruleStore.get(id) || null;
        },
        async findActiveByHouseholdId(householdId: string) {
          return Array.from(ruleStore.values())
            .filter(r => r.householdId === householdId && r.active)
            .sort((a, b) => b.priority - a.priority);
        },
        async delete(id: string) {
          ruleStore.delete(id);
        },
      },
    });
  });

  test('POST /categories/rules creates a rule', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/categories/rules',
      payload: {
        householdId,
        matcher: 'mercado',
        categoryId,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.rule.matcher).toBe('mercado');
  });

  test('POST /categories/rules requires mandatory fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/categories/rules',
      payload: {
        householdId,
        // missing matcher and categoryId
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.reason).toContain('obrigatórios');
  });

  test('GET /categories/rules returns rules for household', async () => {
    // Create a rule first
    await app.inject({
      method: 'POST',
      url: '/categories/rules',
      payload: {
        householdId,
        matcher: 'teste',
        categoryId,
        priority: 10,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/categories/rules?householdId=${householdId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.rules.length).toBe(1);
    expect(body.rules[0].matcher).toBe('teste');
  });

  test('GET /categories/rules requires householdId', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/categories/rules',
    });

    expect(response.statusCode).toBe(400);
  });

  test('GET /categories/rules returns empty for unknown household', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/categories/rules?householdId=${crypto.randomUUID()}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.rules).toHaveLength(0);
  });

  test('DELETE /categories/rules/:id removes rule', async () => {
    // Create a rule
    const createResponse = await app.inject({
      method: 'POST',
      url: '/categories/rules',
      payload: {
        householdId,
        matcher: 'todelete',
        categoryId,
      },
    });

    const ruleId = createResponse.json().rule.id;

    // Delete it
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/categories/rules/${ruleId}`,
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().success).toBe(true);

    // Verify it's gone
    const getResponse = await app.inject({
      method: 'GET',
      url: `/categories/rules?householdId=${householdId}`,
    });

    expect(getResponse.json().rules).toHaveLength(0);
  });

  test('DELETE /categories/rules/:id returns 404 for unknown id', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/categories/rules/${crypto.randomUUID()}`,
    });

    expect(response.statusCode).toBe(404);
  });
});