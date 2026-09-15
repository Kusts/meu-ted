/**
 * FIX-P1-RECEIPT-REMAINING-WRITES — TDD RED-first.
 *
 * The six supported payables/categories/notification writes that still
 * answer success WITHOUT a MutationReceipt must emit a normal browser-safe
 * receipt (mutationId/kind/effects, never operationId), built inside the
 * idempotent producer so keyed replays preserve the mutationId.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import {
  FORBIDDEN_BROWSER_KEYS,
  MUTATION_EFFECTS_REGISTRY,
  mutationReceiptSchema,
  type MutationKind,
} from '@pi-finance/llm-contracts';

const auth = { 'x-device-token': TOKEN_A };
const json = { ...auth, 'content-type': 'application/json' };

const setup = async () => {
  const { app } = buildTestApp();
  const acc = await app.inject({
    method: 'POST',
    url: '/accounts',
    headers: json,
    payload: { name: 'A', kind: 'bank', initialBalanceCents: 50_000 },
  });
  return { app, accountId: acc.json().id as string };
};

const expectValidNormalReceipt = (body: any, kind: MutationKind): void => {
  expect(body.receipt).toBeTruthy();
  expect(body.receipt.mutationKind).toBe(kind);
  expect(body.receipt.status).toBe('succeeded');
  expect(body.receipt.operationId).toBeUndefined();
  expect(body.receipt.affectedTargets).toEqual(
    MUTATION_EFFECTS_REGISTRY[kind].affectedTargets,
  );
  expect(mutationReceiptSchema.safeParse(body.receipt).success).toBe(true);
  for (const key of FORBIDDEN_BROWSER_KEYS) {
    expect(body.receipt[key]).toBeUndefined();
    expect(body[key]).toBeUndefined();
  }
};

describe('remaining write receipts (FIX-P1)', () => {
  it('POST /payables/refresh-status carries a payable.update receipt', async () => {
    const s = await setup();
    const res = await s.app.inject({
      method: 'POST',
      url: '/payables/refresh-status',
      headers: { ...json, 'idempotency-key': 'fixp1-refresh-1' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expectValidNormalReceipt(res.json(), 'payable.update');
  });

  it('POST /payables/templates carries a payable.create receipt', async () => {
    const s = await setup();
    const res = await s.app.inject({
      method: 'POST',
      url: '/payables/templates',
      headers: json,
      payload: {
        accountId: s.accountId,
        name: 'Aluguel template',
        description: 'Aluguel mensal',
        amountCents: 50_000,
        frequency: 'monthly',
        dayOfMonth: 10,
      },
    });
    expect(res.statusCode).toBe(201);
    expectValidNormalReceipt(res.json(), 'payable.create');
  });

  it('POST /payables/from-template carries a payable.create receipt', async () => {
    const s = await setup();
    await s.app.inject({
      method: 'POST',
      url: '/payables/templates',
      headers: json,
      payload: {
        accountId: s.accountId,
        name: 'Aluguel template',
        description: 'Aluguel mensal',
        amountCents: 50_000,
        frequency: 'monthly',
        dayOfMonth: 10,
      },
    });
    const res = await s.app.inject({
      method: 'POST',
      url: '/payables/from-template',
      headers: { ...json, 'idempotency-key': 'fixp1-from-template-1' },
      payload: { templateName: 'Aluguel template', dueDate: '2026-06-20' },
    });
    expect(res.statusCode).toBe(201);
    expectValidNormalReceipt(res.json(), 'payable.create');
  });

  it('POST /payables/auto-create-from-templates carries a payable.create receipt', async () => {
    const s = await setup();
    const res = await s.app.inject({
      method: 'POST',
      url: '/payables/auto-create-from-templates?daysAhead=30',
      headers: { ...json, 'idempotency-key': 'fixp1-auto-create-1' },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    expectValidNormalReceipt(res.json(), 'payable.create');
  });

  it('POST /notifications carries a receipt without operationId', async () => {
    const s = await setup();
    const res = await s.app.inject({
      method: 'POST',
      url: '/notifications',
      headers: json,
      payload: { chatId: 'chat-1', notificationType: 'daily_summary', enabled: true },
    });
    expect(res.statusCode).toBe(201);
    expectValidNormalReceipt(res.json(), 'payable.update');
  });

  it('POST /categories/apply-defaults carries a category.create receipt', async () => {
    const s = await setup();
    const res = await s.app.inject({
      method: 'POST',
      url: '/categories/apply-defaults',
      headers: json,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expectValidNormalReceipt(res.json(), 'category.create');
  });

  it('idempotent replay of refresh-status preserves the receipt identity', async () => {
    const s = await setup();
    const headers = { ...json, 'idempotency-key': 'fixp1-refresh-idem-1' };
    const first = await s.app.inject({
      method: 'POST',
      url: '/payables/refresh-status',
      headers,
      payload: {},
    });
    const second = await s.app.inject({
      method: 'POST',
      url: '/payables/refresh-status',
      headers,
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().receipt.mutationId).toBe(first.json().receipt.mutationId);
    expectValidNormalReceipt(second.json(), 'payable.update');
  });
});

describe('payables bulk/template writes require Idempotency-Key (TEDV3)', () => {
  const createTemplate = async (app: { inject: any }, accountId: string, name: string) =>
    app.inject({
      method: 'POST',
      url: '/payables/templates',
      headers: json,
      payload: {
        accountId,
        name,
        description: `${name} mensal`,
        amountCents: 50_000,
        frequency: 'monthly',
        dayOfMonth: 10,
      },
    });

  it.each([
    ['POST /payables/refresh-status', '/payables/refresh-status', {}],
    ['POST /payables/auto-create-from-templates', '/payables/auto-create-from-templates?daysAhead=30', {}],
    ['POST /payables/from-template', '/payables/from-template', { templateName: 'Aluguel template', dueDate: '2026-06-20' }],
  ])('%s without Idempotency-Key returns 400', async (_label, url, payload) => {
    const s = await setup();
    await createTemplate(s.app, s.accountId, 'Aluguel template');
    const res = await s.app.inject({ method: 'POST', url, headers: json, payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.required');
  });

  it('from-template receipt carries the created payable entity; bulk receipts carry no entity', async () => {
    const s = await setup();
    await createTemplate(s.app, s.accountId, 'Aluguel template');

    const fromTemplate = await s.app.inject({
      method: 'POST',
      url: '/payables/from-template',
      headers: { ...json, 'idempotency-key': 'tedv3-from-template-entity-1' },
      payload: { templateName: 'Aluguel template', dueDate: '2026-06-20' },
    });
    expect(fromTemplate.statusCode).toBe(201);
    const fromBody = fromTemplate.json();
    expectValidNormalReceipt(fromBody, 'payable.create');
    expect(fromBody.receipt.entity).toEqual({ type: 'payable', id: fromBody.id });

    const auto = await s.app.inject({
      method: 'POST',
      url: '/payables/auto-create-from-templates?daysAhead=30',
      headers: { ...json, 'idempotency-key': 'tedv3-auto-create-entity-1' },
      payload: {},
    });
    expect(auto.statusCode).toBe(201);
    expectValidNormalReceipt(auto.json(), 'payable.create');
    expect(auto.json().receipt.entity).toBeUndefined();

    const refresh = await s.app.inject({
      method: 'POST',
      url: '/payables/refresh-status',
      headers: { ...json, 'idempotency-key': 'tedv3-refresh-entity-1' },
      payload: {},
    });
    expect(refresh.statusCode).toBe(200);
    expectValidNormalReceipt(refresh.json(), 'payable.update');
    expect(refresh.json().receipt.entity).toBeUndefined();
  });

  it('idempotent replays of from-template and auto-create preserve the receipt identity', async () => {
    const s = await setup();
    await createTemplate(s.app, s.accountId, 'Aluguel template');

    const fromHeaders = { ...json, 'idempotency-key': 'tedv3-from-template-idem-1' };
    const fromPayload = { templateName: 'Aluguel template', dueDate: '2026-06-20' };
    const fromFirst = await s.app.inject({ method: 'POST', url: '/payables/from-template', headers: fromHeaders, payload: fromPayload });
    const fromSecond = await s.app.inject({ method: 'POST', url: '/payables/from-template', headers: fromHeaders, payload: fromPayload });
    expect(fromFirst.statusCode).toBe(201);
    expect(fromSecond.statusCode).toBe(201);
    expect(fromSecond.headers['idempotent-replayed']).toBe('true');
    expect(fromSecond.json().receipt.mutationId).toBe(fromFirst.json().receipt.mutationId);
    expectValidNormalReceipt(fromSecond.json(), 'payable.create');

    const autoHeaders = { ...json, 'idempotency-key': 'tedv3-auto-create-idem-1' };
    const autoFirst = await s.app.inject({ method: 'POST', url: '/payables/auto-create-from-templates?daysAhead=30', headers: autoHeaders, payload: {} });
    const autoSecond = await s.app.inject({ method: 'POST', url: '/payables/auto-create-from-templates?daysAhead=30', headers: autoHeaders, payload: {} });
    expect(autoFirst.statusCode).toBe(201);
    expect(autoSecond.statusCode).toBe(201);
    expect(autoSecond.headers['idempotent-replayed']).toBe('true');
    expect(autoSecond.json().receipt.mutationId).toBe(autoFirst.json().receipt.mutationId);
    expectValidNormalReceipt(autoSecond.json(), 'payable.create');
  });

  it('bulk/template receipts are never a false no-refresh', async () => {
    const s = await setup();
    await createTemplate(s.app, s.accountId, 'Aluguel template');
    const targets = (kind: MutationKind) => MUTATION_EFFECTS_REGISTRY[kind].affectedTargets;
    expect(targets('payable.create').length).toBeGreaterThan(0);
    expect(targets('payable.update').length).toBeGreaterThan(0);

    const auto = await s.app.inject({
      method: 'POST',
      url: '/payables/auto-create-from-templates?daysAhead=30',
      headers: { ...json, 'idempotency-key': 'tedv3-no-refresh-1' },
      payload: {},
    });
    expect(auto.json().receipt.affectedTargets).toEqual(targets('payable.create'));
    const refresh = await s.app.inject({
      method: 'POST',
      url: '/payables/refresh-status',
      headers: { ...json, 'idempotency-key': 'tedv3-no-refresh-2' },
      payload: {},
    });
    expect(refresh.json().receipt.affectedTargets).toEqual(targets('payable.update'));
  });
});
