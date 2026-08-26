import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { HOUSEHOLD_A, HOUSEHOLD_B } from '../fixtures/seed.js';
import { createInMemoryAuditLogStore } from '../../src/audit/store.js';
import type { AuditLog } from '../../src/audit/store.js';
import type { Account, Category, Transaction } from '../../src/types/domain.js';

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

const TX_A1: Transaction = {
  id: '33333333-3333-4333-8333-333333333301',
  householdId: HOUSEHOLD_A,
  kind: 'expense',
  description: 'Compra A1',
  amountCents: 5_000,
  date: '2026-06-10',
  accountId: ACCOUNT_A.id,
  categoryId: CATEGORY_A.id,
};

const TX_A2: Transaction = {
  id: '33333333-3333-4333-8333-333333333302',
  householdId: HOUSEHOLD_A,
  kind: 'expense',
  description: 'Compra A2',
  amountCents: 7_000,
  date: '2026-06-11',
  accountId: ACCOUNT_A.id,
  categoryId: CATEGORY_A.id,
};

const ACCOUNT_B: Account = {
  id: '11111111-1111-4111-8111-111111111113',
  householdId: HOUSEHOLD_B,
  name: 'Bradesco B',
  kind: 'bank',
  balanceCents: 99_999,
  status: 'active',
};

const CATEGORY_B: Category = {
  id: '22222222-2222-4222-8222-222222222224',
  householdId: HOUSEHOLD_B,
  name: 'Mercado B',
  kind: 'expense',
  status: 'active',
};

const TX_B1: Transaction = {
  id: '33333333-3333-4333-8333-333333333305',
  householdId: HOUSEHOLD_B,
  kind: 'expense',
  description: 'Compra B1',
  amountCents: 2_000,
  date: '2026-06-09',
  accountId: ACCOUNT_B.id,
  categoryId: CATEGORY_B.id,
};

const makeAudit = (overrides: Partial<AuditLog> & { id: string; workspaceId: string }): AuditLog => ({
  actorType: 'device',
  actorId: 'dev-device-1',
  operation: 'transactions.expense.create',
  eventType: 'financial_effect.committed',
  payloadHash: 'hash',
  effectRef: overrides.metadata?.entityId as string | undefined,
  metadata: { entityId: overrides.metadata?.entityId ?? 'unknown' },
  createdAt: new Date().toISOString(),
  ...overrides,
} as AuditLog);

const authA = { 'x-device-token': TOKEN_A };
const authB = { 'x-device-token': TOKEN_B };

describe('POST /audit/undo — undo_last_action (TDD fase-1)', () => {
  it('401 without authentication', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { 'idempotency-key': 'k-401', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('400 when Idempotency-Key missing (obrigatório)', async () => {
    const { app } = buildTestApp({ auditLogs: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.required');
  });

  it('404 when no eligible operation to undo', async () => {
    const { app } = buildTestApp({ auditLogs: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'idempotency-key': 'undo-empty-1', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('undo.nothing_to_undo');
  });

  it('200 desfaz última operação do household (audit_logs + operation_records)', async () => {
    const auditLogs: AuditLog[] = [
      makeAudit({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        workspaceId: HOUSEHOLD_A,
        actorId: 'dev-device-1',
        operation: 'transactions.expense.create',
        metadata: { entityId: TX_A1.id },
        createdAt: '2026-06-10T12:00:00.000Z',
      }),
    ];
    const { app, state } = buildTestApp(
      { accounts: [ACCOUNT_A], categories: [CATEGORY_A], transactions: [TX_A1], auditLogs },
    );
    // Ensure transaction exists before undo
    expect(state.transactions.some((t) => t.id === TX_A1.id)).toBe(true);
    const res = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'idempotency-key': 'undo-ok-1', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      undone: { operation: 'transactions.expense.create', entityId: TX_A1.id, reversal: 'soft_delete' },
    });
    // soft-deleted should be tombstoned
    expect(state.deletedTransactions.has(TX_A1.id)).toBe(true);
  });

  it('isolamento household: household B não desfaz operação de A e vice-versa', async () => {
    const auditLogs: AuditLog[] = [
      makeAudit({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        workspaceId: HOUSEHOLD_A,
        actorId: 'dev-device-1',
        operation: 'transactions.expense.create',
        metadata: { entityId: TX_A1.id },
        createdAt: '2026-06-10T12:00:00.000Z',
      }),
      makeAudit({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        workspaceId: HOUSEHOLD_B,
        actorId: 'dev-device-2',
        operation: 'transactions.expense.create',
        metadata: { entityId: TX_B1.id },
        createdAt: '2026-06-10T12:00:00.000Z',
      }),
    ];
    const { app, state } = buildTestApp(
      {
        accounts: [ACCOUNT_A, ACCOUNT_B],
        categories: [CATEGORY_A, CATEGORY_B],
        transactions: [TX_A1, TX_B1],
        auditLogs,
      },
    );
    // A undoes its own
    const undoA = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'idempotency-key': 'undo-iso-a', 'content-type': 'application/json' },
      payload: {},
    });
    expect(undoA.statusCode).toBe(200);
    expect(undoA.json().undone.entityId).toBe(TX_A1.id);
    expect(state.deletedTransactions.has(TX_B1.id)).toBe(false);

    // B still can undo its own (A's undo did not affect B)
    const undoB = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authB, 'idempotency-key': 'undo-iso-b', 'content-type': 'application/json' },
      payload: {},
    });
    expect(undoB.statusCode).toBe(200);
    expect(undoB.json().undone.entityId).toBe(TX_B1.id);

    // Now both households have nothing left -> 404
    const emptyA = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'idempotency-key': 'undo-iso-a2', 'content-type': 'application/json' },
      payload: {},
    });
    expect(emptyA.statusCode).toBe(404);

    // Cross-household attempt: create app with only A logs, B tries to undo -> 404
    const { app: app2 } = buildTestApp({
      accounts: [ACCOUNT_A],
      categories: [CATEGORY_A],
      transactions: [{ ...TX_A2 }],
      auditLogs: [
        makeAudit({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
          workspaceId: HOUSEHOLD_A,
          actorId: 'dev-device-1',
          operation: 'transactions.expense.create',
          metadata: { entityId: TX_A2.id },
          createdAt: '2026-06-11T12:00:00.000Z',
        }),
      ],
    });
    const cross = await app2.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authB, 'idempotency-key': 'undo-cross', 'content-type': 'application/json' },
      payload: {},
    });
    expect(cross.statusCode).toBe(404);
  });

  it('lastOperationId: desfaz operação específica quando informado', async () => {
    const auditLogs: AuditLog[] = [
      makeAudit({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
        workspaceId: HOUSEHOLD_A,
        actorId: 'dev-device-1',
        operation: 'transactions.expense.create',
        metadata: { entityId: TX_A1.id },
        createdAt: '2026-06-09T12:00:00.000Z',
      }),
      makeAudit({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
        workspaceId: HOUSEHOLD_A,
        actorId: 'dev-device-1',
        operation: 'transactions.expense.create',
        metadata: { entityId: TX_A2.id },
        createdAt: '2026-06-10T12:00:00.000Z',
      }),
    ];
    const { app, state } = buildTestApp(
      { accounts: [ACCOUNT_A], categories: [CATEGORY_A], transactions: [TX_A1, TX_A2], auditLogs },
    );

    // Without lastOperationId, should undo most recent (TX_A2)
    const latest = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'idempotency-key': 'undo-last-id-1', 'content-type': 'application/json' },
      payload: {},
    });
    expect(latest.statusCode).toBe(200);
    expect(latest.json().undone.entityId).toBe(TX_A2.id);
    expect(state.deletedTransactions.has(TX_A2.id)).toBe(true);

    // Now with explicit lastOperationId pointing to older operation (TX_A1)
    const specific = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'idempotency-key': 'undo-last-id-2', 'content-type': 'application/json' },
      payload: { lastOperationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4' },
    });
    expect(specific.statusCode).toBe(200);
    expect(specific.json().undone.entityId).toBe(TX_A1.id);

    // Invalid lastOperationId => 404
    const invalid = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'idempotency-key': 'undo-last-id-3', 'content-type': 'application/json' },
      payload: { lastOperationId: '00000000-0000-4000-a000-000000000099' },
    });
    expect(invalid.statusCode).toBe(404);
  });

  it('idempotência: mesmo Idempotency-Key retorna resultado canônico sem re-executar', async () => {
    const auditLogs: AuditLog[] = [
      makeAudit({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
        workspaceId: HOUSEHOLD_A,
        actorId: 'dev-device-1',
        operation: 'transactions.expense.create',
        metadata: { entityId: TX_A1.id },
        createdAt: '2026-06-10T12:00:00.000Z',
      }),
    ];
    const { app, state } = buildTestApp(
      { accounts: [ACCOUNT_A], categories: [CATEGORY_A], transactions: [TX_A1], auditLogs },
    );
    const first = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'idempotency-key': 'undo-idem-1', 'content-type': 'application/json' },
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'idempotency-key': 'undo-idem-1', 'content-type': 'application/json' },
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().undone).toEqual(first.json().undone);
    // Still only one soft-delete; second didn't duplicate error
    expect(state.deletedTransactions.has(TX_A1.id)).toBe(true);

    // New key after already undone -> 404 (nothing left)
    const third = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...authA, 'idempotency-key': 'undo-idem-2', 'content-type': 'application/json' },
      payload: {},
    });
    expect(third.statusCode).toBe(404);
  });

  it('compatibilidade legado POST /pending-operations/undo com Idempotency-Key obrigatório', async () => {
    const auditLogs: AuditLog[] = [
      makeAudit({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7',
        workspaceId: HOUSEHOLD_A,
        actorId: 'dev-device-1',
        operation: 'transactions.expense.create',
        metadata: { entityId: TX_A1.id },
        createdAt: '2026-06-10T12:00:00.000Z',
      }),
    ];
    const { app } = buildTestApp(
      { accounts: [ACCOUNT_A], categories: [CATEGORY_A], transactions: [TX_A1], auditLogs },
    );
    const noKey = await app.inject({
      method: 'POST',
      url: '/pending-operations/undo',
      headers: { ...authA, 'content-type': 'application/json' },
      payload: {},
    });
    expect(noKey.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: '/pending-operations/undo',
      headers: { ...authA, 'idempotency-key': 'undo-legacy-1', 'content-type': 'application/json' },
      payload: {},
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().undone.entityId).toBe(TX_A1.id);
  });
});
