import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from '../../src/routes/index.js';
import { createInMemoryAuditLogStore, type AuditLog } from '../../src/audit/store.js';
import { createInMemoryReadModelStore } from '../../src/read-models/store.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryIdempotencyStore } from '../../src/writes/idempotency.js';
import type { DeviceTokenStore } from '../../src/auth/device-token.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import type { Account, Category, Transaction } from '../../src/types/domain.js';

/**
 * FIX-P1-UNDO-BOOTSTRAP (TDD RED→GREEN):
 * Prova o wiring de produção end-to-end: monta o app via `registerRoutes`
 * SEM injetar `undoService` (exatamente como `server/index.ts` e
 * `server/production-routes.ts` fazem hoje) com stores reais (writes +
 * auditLogs). A intenção da SPEC é `/audit/undo` suportado com
 * receipt/idempotência — `unsupported` aqui é o bug.
 */
const ACCOUNT_A: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  householdId: HOUSEHOLD_A,
  name: 'Itaú A',
  kind: 'bank',
  balanceCents: 10_000_00,
  status: 'active',
};

const CATEGORY_A: Category = {
  id: '22222222-2222-4222-8222-222222222221',
  householdId: HOUSEHOLD_A,
  name: 'Mercado A',
  kind: 'expense',
  status: 'active',
};

const TX_1: Transaction = {
  id: '33333333-3333-4333-8333-333333333301',
  householdId: HOUSEHOLD_A,
  kind: 'expense',
  description: 'Compra bootstrap 1',
  amountCents: 5_000,
  date: '2026-06-10',
  accountId: ACCOUNT_A.id,
  categoryId: CATEGORY_A.id,
};

const TX_2: Transaction = {
  id: '33333333-3333-4333-8333-333333333302',
  householdId: HOUSEHOLD_A,
  kind: 'expense',
  description: 'Compra bootstrap 2',
  amountCents: 7_000,
  date: '2026-06-11',
  accountId: ACCOUNT_A.id,
  categoryId: CATEGORY_A.id,
};

const makeAudit = (id: string, entityId: string, createdAt: string): AuditLog => ({
  id,
  workspaceId: HOUSEHOLD_A,
  actorType: 'device',
  actorId: 'dev-device-1',
  operation: 'transactions.expense.create',
  eventType: 'financial_effect.committed',
  payloadHash: 'hash',
  effectRef: entityId,
  metadata: { entityId },
  createdAt,
});

const tokenStore: DeviceTokenStore = {
  async resolve(token) {
    if (token !== 'dev-token-1') {
      throw Object.assign(new Error('invalid'), { statusCode: 401, code: 'auth.invalid_token' });
    }
    return { deviceId: 'dev-device-1', householdId: HOUSEHOLD_A };
  },
  async register(_deviceName, householdId) {
    return { token: 'dev-token-1', deviceId: 'dev-device-1', householdId };
  },
  async revoke() {},
  async rotate(_currentToken, _deviceName, householdId) {
    return { token: 'dev-token-1', deviceId: 'dev-device-1', householdId };
  },
};

/** Monta o app como o bootstrap de produção: sem `undoService` injetado. */
const buildProductionLikeApp = () => {
  const { state, writes } = createInMemoryStores({
    accounts: [ACCOUNT_A],
    categories: [CATEGORY_A],
    transactions: [TX_1, TX_2],
  });
  const store = createInMemoryReadModelStore({
    accounts: state.accounts,
    categories: state.categories,
    transactions: state.transactions,
    deletedTransactionIds: state.deletedTransactions,
  });
  const auditLogs = createInMemoryAuditLogStore([
    makeAudit('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac1', TX_1.id, '2026-06-10T12:00:00.000Z'),
    makeAudit('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac2', TX_2.id, '2026-06-11T12:00:00.000Z'),
  ]);
  const app = Fastify({ logger: false });
  registerRoutes(app, {
    store,
    writes,
    tokenStore,
    idempotency: createInMemoryIdempotencyStore(),
    auditLogs,
    disableDeviceRegistration: true,
    // NOTE: nenhum `undoService` — o bootstrap de produção não injeta.
  });
  return { app, state };
};

const auth = { 'x-device-token': 'dev-token-1' };

describe('FIX-P1-UNDO-BOOTSTRAP: wiring de produção de /audit/undo', () => {
  it('POST /audit/undo responde com UndoResult+receipt (não unsupported)', async () => {
    const { app } = buildProductionLikeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...auth, 'idempotency-key': 'bootstrap-undo-1', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.undone).toMatchObject({
      operation: 'transactions.expense.create',
      entityId: TX_2.id,
      reversal: 'soft_delete',
    });
    expect(body.receipt).toBeDefined();
    expect(body.receipt.entity).toMatchObject({ type: 'transaction', id: TX_2.id });
  });

  it('idempotência por Idempotency-Key preservada no wiring de produção', async () => {
    const { app } = buildProductionLikeApp();
    const headers = { ...auth, 'idempotency-key': 'bootstrap-undo-idem', 'content-type': 'application/json' };
    const first = await app.inject({ method: 'POST', url: '/audit/undo', headers, payload: {} });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: '/audit/undo', headers, payload: {} });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });

  it('rota legada /pending-operations/undo continua consistente no mesmo wiring', async () => {
    const { app } = buildProductionLikeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/pending-operations/undo',
      headers: { ...auth, 'idempotency-key': 'bootstrap-undo-legacy', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().undone).toMatchObject({
      operation: 'transactions.expense.create',
      entityId: TX_2.id,
    });
    expect(res.json().receipt).toBeDefined();
  });
});
