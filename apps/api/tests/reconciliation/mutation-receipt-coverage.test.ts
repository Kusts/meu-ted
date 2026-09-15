/**
 * T3.2 — MutationReceipt coverage (SPEC §15.1/§15.6): every supported normal
 * mutation route returns a server-generated receipt with registry-derived
 * affectedTargets (or is explicitly classified no-refresh); normal writes
 * NEVER carry operationId, and idempotent replays preserve the receipt
 * identity (same mutationId).
 *
 * TDD: RED-first — DELETE /transactions/:id answers 204 without a body and
 * both undo routes answer without a receipt.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  CARD_A1,
  CATEGORY_FOOD_A,
  CATEGORY_RENT_A,
  HOUSEHOLD_A,
} from '../fixtures/seed.js';
import type { AuditLog } from '../../src/audit/store.js';
import type { Account, Category, Transaction } from '../../src/types/domain.js';
import {
  FORBIDDEN_BROWSER_KEYS,
  MUTATION_EFFECTS_REGISTRY,
  MUTATION_KINDS,
  TED_APPROVAL_TOOLS,
  mutationReceiptSchema,
  type MutationKind,
} from '@pi-finance/llm-contracts';

const isoDate = '2026-06-10';
const auth = { 'x-device-token': TOKEN_A };
const json = { ...auth, 'content-type': 'application/json' };

const setupAccountAndCategory = async () => {
  const { app } = buildTestApp();
  const acc = await app.inject({
    method: 'POST',
    url: '/accounts',
    headers: json,
    payload: { name: 'A', kind: 'bank', initialBalanceCents: 50_000 },
  });
  const cat = await app.inject({
    method: 'POST',
    url: '/categories',
    headers: json,
    payload: { name: 'Food', kind: 'expense' },
  });
  return { app, accountId: acc.json().id as string, categoryId: cat.json().id as string };
};

const expectValidNormalReceipt = (body: any, kind: MutationKind): void => {
  expect(body.receipt).toBeTruthy();
  expect(body.receipt.mutationKind).toBe(kind);
  expect(body.receipt.status).toBe('succeeded');
  // SPEC §15.1: normal-write receipts are valid WITHOUT operationId and must
  // never be converted into PendingOperations to obtain the field.
  expect(body.receipt.operationId).toBeUndefined();
  expect(body.receipt.affectedTargets).toEqual(
    MUTATION_EFFECTS_REGISTRY[kind].affectedTargets,
  );
  expect(mutationReceiptSchema.safeParse(body.receipt).success).toBe(true);
};

// ── Seeded undo fixture (mirrors tests/routes/undo.test.ts) ────────────────

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

const makeAudit = (overrides: Partial<AuditLog> & { id: string; workspaceId: string }): AuditLog =>
  ({
    actorType: 'device',
    actorId: 'dev-device-1',
    operation: 'transactions.expense.create',
    eventType: 'financial_effect.committed',
    payloadHash: 'hash',
    effectRef: overrides.metadata?.entityId as string | undefined,
    metadata: { entityId: overrides.metadata?.entityId ?? 'unknown' },
    createdAt: new Date().toISOString(),
    ...overrides,
  }) as AuditLog;

const buildUndoApp = () =>
  buildTestApp({
    accounts: [{ ...ACCOUNT_A }],
    categories: [{ ...CATEGORY_A }],
    transactions: [{ ...TX_A1 }],
    auditLogs: [
      makeAudit({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac1',
        workspaceId: HOUSEHOLD_A,
        actorId: 'dev-device-1',
        operation: 'transactions.expense.create',
        metadata: { entityId: TX_A1.id },
        createdAt: '2026-06-10T12:00:00.000Z',
      }),
    ],
  });

describe('mutation effects registry — completeness', () => {
  it('every MUTATION_KIND resolves to a non-empty target set or an explicit no-refresh marker', () => {
    for (const kind of MUTATION_KINDS) {
      const entry = MUTATION_EFFECTS_REGISTRY[kind];
      expect(entry).toBeTruthy();
      if ((entry as { noRefresh?: boolean }).noRefresh === true) {
        expect(entry.affectedTargets).toEqual([]);
      } else {
        expect(entry.affectedTargets.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('DELETE /transactions/:id carries a MutationReceipt', () => {
  it('returns 200 with a valid transaction.delete receipt instead of a bodiless 204', async () => {
    const s = await setupAccountAndCategory();
    const created = await s.app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: json,
      payload: {
        description: 'bye',
        amountCents: 100,
        date: isoDate,
        accountId: s.accountId,
        categoryId: s.categoryId,
      },
    });
    const id = created.json().id as string;
    const del = await s.app.inject({
      method: 'DELETE',
      url: `/transactions/${id}`,
      headers: { ...auth, 'idempotency-key': 't32-del-1' },
    });
    expect(del.statusCode).toBe(200);
    const body = del.json();
    expect(body.id).toBe(id);
    expectValidNormalReceipt(body, 'transaction.delete');
    // Soft-delete semantics preserved: excluded from listing, second delete 404s.
    const list = await s.app.inject({ method: 'GET', url: '/transactions', headers: auth });
    expect(list.json().items.find((t: { id: string }) => t.id === id)).toBeUndefined();
    const again = await s.app.inject({ method: 'DELETE', url: `/transactions/${id}`, headers: auth });
    expect(again.statusCode).toBe(404);
  });

  it('idempotent replay of a delete preserves the receipt identity', async () => {
    const s = await setupAccountAndCategory();
    const created = await s.app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: json,
      payload: {
        description: 'idem-del',
        amountCents: 100,
        date: isoDate,
        accountId: s.accountId,
        categoryId: s.categoryId,
      },
    });
    const id = created.json().id as string;
    const headers = { ...auth, 'idempotency-key': 't32-del-idem-1' };
    const first = await s.app.inject({ method: 'DELETE', url: `/transactions/${id}`, headers });
    const second = await s.app.inject({ method: 'DELETE', url: `/transactions/${id}`, headers });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    // Receipt identity is deterministic across idempotent replays (the
    // receipt is stored with the idempotent response, like PATCH).
    expect(second.json().receipt.mutationId).toBe(first.json().receipt.mutationId);
    expectValidNormalReceipt(second.json(), 'transaction.delete');
  });
});

describe('undo routes carry a MutationReceipt', () => {
  it('POST /audit/undo returns a valid receipt for the financial reversal', async () => {
    const { app } = buildUndoApp();
    const res = await app.inject({
      method: 'POST',
      url: '/audit/undo',
      headers: { ...json, 'idempotency-key': 't32-undo-1' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.undone).toMatchObject({
      operation: 'transactions.expense.create',
      entityId: TX_A1.id,
      reversal: 'soft_delete',
    });
    // The reversal removes a financial target → a receipt is required
    // (no-refresh is only for target-less mutations).
    expectValidNormalReceipt(body, 'transaction.delete');
  });

  it('POST /pending-operations/undo returns the same receipt contract', async () => {
    const { app } = buildUndoApp();
    const res = await app.inject({
      method: 'POST',
      url: '/pending-operations/undo',
      headers: { ...json, 'idempotency-key': 't32-undo-legacy-1' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().undone.entityId).toBe(TX_A1.id);
    expectValidNormalReceipt(res.json(), 'transaction.delete');
  });

  it('idempotent replay of an undo preserves the receipt identity', async () => {
    const { app } = buildUndoApp();
    const headers = { ...json, 'idempotency-key': 't32-undo-idem-1' };
    const first = await app.inject({ method: 'POST', url: '/audit/undo', headers, payload: {} });
    const second = await app.inject({ method: 'POST', url: '/audit/undo', headers, payload: {} });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().undone).toEqual(first.json().undone);
    expect(second.json().receipt.mutationId).toBe(first.json().receipt.mutationId);
  });
});

describe('supported normal-write routes all carry registry receipts (inventory)', () => {
  it('transaction + transfer writes', async () => {
    const s = await setupAccountAndCategory();
    const created = await s.app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: json,
      payload: {
        description: 'Lunch',
        amountCents: 1500,
        date: isoDate,
        accountId: s.accountId,
        categoryId: s.categoryId,
      },
    });
    expect(created.statusCode).toBe(201);
    expectValidNormalReceipt(created.json(), 'transaction.create');

    const patched = await s.app.inject({
      method: 'PATCH',
      url: `/transactions/${created.json().id}`,
      headers: json,
      payload: { description: 'Lunch!' },
    });
    expect(patched.statusCode).toBe(200);
    expectValidNormalReceipt(patched.json(), 'transaction.update');

    const accB = await s.app.inject({
      method: 'POST',
      url: '/accounts',
      headers: json,
      payload: { name: 'B', kind: 'bank', initialBalanceCents: 10_000 },
    });
    const transfer = await s.app.inject({
      method: 'POST',
      url: '/transfers',
      headers: json,
      payload: {
        description: 'hop',
        amountCents: 100,
        date: isoDate,
        fromAccountId: s.accountId,
        toAccountId: accB.json().id,
      },
    });
    expect(transfer.statusCode).toBe(201);
    expectValidNormalReceipt(transfer.json(), 'transfer.create');
  });

  it('account + category writes', async () => {
    const s = await setupAccountAndCategory();
    const patchedAcc = await s.app.inject({
      method: 'PATCH',
      url: `/accounts/${s.accountId}`,
      headers: json,
      payload: { name: 'A2' },
    });
    expect(patchedAcc.statusCode).toBe(200);
    expectValidNormalReceipt(patchedAcc.json(), 'account.update');

    const patchedCat = await s.app.inject({
      method: 'PATCH',
      url: `/categories/${s.categoryId}`,
      headers: json,
      payload: { name: 'Food2' },
    });
    expect(patchedCat.statusCode).toBe(200);
    expectValidNormalReceipt(patchedCat.json(), 'category.update');

    const deactCat = await s.app.inject({
      method: 'POST',
      url: `/categories/${s.categoryId}/deactivate`,
      headers: json,
      payload: {},
    });
    expect(deactCat.statusCode).toBe(200);
    expectValidNormalReceipt(deactCat.json(), 'category.delete');

    const deactAcc = await s.app.inject({
      method: 'POST',
      url: `/accounts/${s.accountId}/deactivate`,
      headers: json,
      payload: {},
    });
    expect(deactAcc.statusCode).toBe(200);
    expectValidNormalReceipt(deactAcc.json(), 'account.delete');
  });

  it('budget + goal + subscription writes', async () => {
    const s = await setupAccountAndCategory();
    const budget = await s.app.inject({
      method: 'POST',
      url: '/budgets',
      headers: json,
      payload: {
        categoryId: s.categoryId,
        name: 'Food budget',
        amountCents: 10_000,
        period: 'monthly',
        startDate: '2026-06-01',
      },
    });
    expect(budget.statusCode).toBe(201);
    expectValidNormalReceipt(budget.json(), 'budget.create');

    const budgetUpd = await s.app.inject({
      method: 'PATCH',
      url: `/budgets/${budget.json().id}`,
      headers: json,
      payload: { amountCents: 12_000 },
    });
    expect(budgetUpd.statusCode).toBe(200);
    expectValidNormalReceipt(budgetUpd.json(), 'budget.update');

    const goal = await s.app.inject({
      method: 'POST',
      url: '/goals',
      headers: json,
      payload: {
        name: 'Trip',
        goalType: 'savings',
        targetAmountCents: 100_000,
        startDate: '2026-06-01',
      },
    });
    expect(goal.statusCode).toBe(201);
    expectValidNormalReceipt(goal.json(), 'goal.create');

    const contrib = await s.app.inject({
      method: 'POST',
      url: `/goals/${goal.json().id}/contribute`,
      headers: json,
      payload: { amountCents: 5_000 },
    });
    expect(contrib.statusCode).toBe(201);
    expectValidNormalReceipt(contrib.json(), 'goal.update');

    const cancelGoal = await s.app.inject({
      method: 'POST',
      url: `/goals/${goal.json().id}/cancel`,
      headers: json,
      payload: {},
    });
    expect(cancelGoal.statusCode).toBe(200);
    expectValidNormalReceipt(cancelGoal.json(), 'goal.delete');

    const sub = await s.app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: json,
      payload: {
        name: 'Stream',
        amountCents: 3_000,
        cycle: 'monthly',
        day: 10,
        paymentMethod: 'pix',
      },
    });
    expect(sub.statusCode).toBe(201);
    expectValidNormalReceipt(sub.json(), 'subscription.create');

    const subUpd = await s.app.inject({
      method: 'PATCH',
      url: `/subscriptions/${sub.json().id}`,
      headers: json,
      payload: { amountCents: 3_500 },
    });
    expect(subUpd.statusCode).toBe(200);
    expectValidNormalReceipt(subUpd.json(), 'subscription.update');

    const subCancel = await s.app.inject({
      method: 'POST',
      url: `/subscriptions/${sub.json().id}/cancel`,
      headers: json,
      payload: {},
    });
    expect(subCancel.statusCode).toBe(200);
    expectValidNormalReceipt(subCancel.json(), 'subscription.delete');
  });

  it('payable lifecycle writes', async () => {
    const s = await setupAccountAndCategory();
    const created = await s.app.inject({
      method: 'POST',
      url: '/payables',
      headers: json,
      payload: {
        accountId: s.accountId,
        description: 'Rent',
        amountCents: 50_000,
        dueDate: '2026-06-20',
      },
    });
    expect(created.statusCode).toBe(201);
    expectValidNormalReceipt(created.json(), 'payable.create');
    const id = created.json().id as string;

    const upd = await s.app.inject({
      method: 'PATCH',
      url: `/payables/${id}`,
      headers: json,
      payload: { description: 'Rent!' },
    });
    expect(upd.statusCode).toBe(200);
    expectValidNormalReceipt(upd.json(), 'payable.update');

    const pay = await s.app.inject({
      method: 'POST',
      url: `/payables/${id}/pay`,
      headers: json,
      payload: {},
    });
    expect(pay.statusCode).toBe(200);
    expectValidNormalReceipt(pay.json(), 'payable.pay');

    const unpay = await s.app.inject({
      method: 'POST',
      url: `/payables/${id}/unpay`,
      headers: json,
      payload: {},
    });
    expect(unpay.statusCode).toBe(200);
    expectValidNormalReceipt(unpay.json(), 'payable.payment.undo');

    const cancel = await s.app.inject({
      method: 'POST',
      url: `/payables/${id}/cancel`,
      headers: json,
      payload: {},
    });
    expect(cancel.statusCode).toBe(200);
    expectValidNormalReceipt(cancel.json(), 'payable.delete');
  });
});

describe('card + statement writes (FIX-P1 inventory)', () => {
  const cardSeed = () => JSON.parse(JSON.stringify({
    accounts: [ACCOUNT_A1, ACCOUNT_A2, CARD_A1],
    categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A],
    transactions: [],
  }));

  const expectBrowserSafe = (body: any): void => {
    for (const key of FORBIDDEN_BROWSER_KEYS) {
      expect(body.receipt[key]).toBeUndefined();
      expect(body[key]).toBeUndefined();
    }
  };

  it('purchase + installment writes carry transaction.create receipts', async () => {
    const { app } = buildTestApp(cardSeed());
    const purchase = await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: json,
      payload: {
        accountId: CARD_A1.id,
        description: 'Mercado',
        amountCents: 150_00,
        date: isoDate,
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(purchase.statusCode).toBe(201);
    expectValidNormalReceipt(purchase.json(), 'transaction.create');
    expectBrowserSafe(purchase.json());

    const installments = await app.inject({
      method: 'POST',
      url: '/cards/installments',
      headers: json,
      payload: {
        accountId: CARD_A1.id,
        description: 'Notebook 3x',
        totalAmountCents: 3_000_00,
        purchaseDate: isoDate,
        installmentsTotal: 3,
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(installments.statusCode).toBe(201);
    expectValidNormalReceipt(installments.json(), 'transaction.create');
    expectBrowserSafe(installments.json());
  });

  it('recurring + card account writes carry statement/account receipts', async () => {
    const { app } = buildTestApp(cardSeed());
    const recurring = await app.inject({
      method: 'POST',
      url: '/cards/recurring',
      headers: json,
      payload: {
        accountId: CARD_A1.id,
        description: 'Stream',
        amountCents: 39_90,
        frequency: 'monthly',
        startDate: '2026-06-15',
      },
    });
    expect(recurring.statusCode).toBe(201);
    expectValidNormalReceipt(recurring.json(), 'statement.create');
    expectBrowserSafe(recurring.json());

    const created = await app.inject({
      method: 'POST',
      url: '/cards',
      headers: json,
      payload: { name: 'Extra', creditLimitCents: 5_000_00, closingDay: 5, dueDay: 15 },
    });
    expect(created.statusCode).toBe(201);
    expectValidNormalReceipt(created.json(), 'account.create');
    expectBrowserSafe(created.json());

    const patched = await app.inject({
      method: 'PATCH',
      url: `/cards/${CARD_A1.id}`,
      headers: json,
      payload: { name: 'Renomeado' },
    });
    expect(patched.statusCode).toBe(200);
    expectValidNormalReceipt(patched.json(), 'account.update');
    expectBrowserSafe(patched.json());
  });

  it('purchase update + cancel carry transaction receipts (cancel is 200, not 204)', async () => {
    const { app } = buildTestApp(cardSeed());
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 35);
    const openDate = d.toISOString().slice(0, 10);
    const created = await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: json,
      payload: {
        accountId: CARD_A1.id,
        description: 'Editável',
        amountCents: 70_00,
        date: openDate,
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    const purchaseId = created.json().items[0].id as string;

    const upd = await app.inject({
      method: 'PATCH',
      url: `/cards/purchases/${purchaseId}`,
      headers: json,
      payload: { description: 'Editado' },
    });
    expect(upd.statusCode).toBe(200);
    expectValidNormalReceipt(upd.json(), 'transaction.update');
    expectBrowserSafe(upd.json());

    const del = await app.inject({
      method: 'DELETE',
      url: `/cards/purchases/${purchaseId}`,
      headers: auth,
    });
    expect(del.statusCode).toBe(200);
    expectValidNormalReceipt(del.json(), 'transaction.delete');
    expectBrowserSafe(del.json());
  });

  it('statement pay carries a statement.update receipt', async () => {
    const { app } = buildTestApp(cardSeed());
    await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: json,
      payload: {
        accountId: CARD_A1.id,
        description: 'Fatura',
        amountCents: 500_00,
        date: isoDate,
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    const statementId = (
      await app.inject({ method: 'GET', url: `/cards/statements?accountId=${CARD_A1.id}`, headers: auth })
    ).json().items[0].id as string;
    const pay = await app.inject({
      method: 'POST',
      url: `/cards/statements/${statementId}/pay`,
      headers: json,
      payload: { amountCents: 500_00, fromAccountId: ACCOUNT_A1.id },
    });
    expect(pay.statusCode).toBe(200);
    expectValidNormalReceipt(pay.json(), 'statement.update');
    expectBrowserSafe(pay.json());
  });
});

describe('mutation coverage completeness (FIX-P1 inventory)', () => {
  /**
   * Canonical receipted route per normal-write kind. Every non-TED
   * MutationKind MUST appear here (or in ROUTELESS_KINDS below) — a kind
   * with no receipted route and no explicit classification fails this test.
   */
  const KIND_TO_ROUTES: Record<string, string[]> = {
    'transaction.create': ['POST /transactions/expense', 'POST /cards/purchases', 'POST /cards/installments'],
    'transaction.update': ['PATCH /transactions/:id', 'PATCH /cards/purchases/:id'],
    'transaction.delete': ['DELETE /transactions/:id', 'DELETE /cards/purchases/:id'],
    'transfer.create': ['POST /transfers'],
    'payable.create': ['POST /payables', 'POST /payables/templates', 'POST /payables/from-template', 'POST /payables/auto-create-from-templates'],
    'payable.update': ['PATCH /payables/:id', 'POST /payables/refresh-status', 'POST /notifications'],
    'payable.delete': ['POST /payables/:id/cancel'],
    'payable.pay': ['POST /payables/:id/pay'],
    'payable.payment.undo': ['POST /payables/:id/unpay'],
    'statement.create': ['POST /cards/recurring'],
    'statement.update': ['POST /cards/statements/:id/pay'],
    'budget.create': ['POST /budgets'],
    'budget.update': ['PATCH /budgets/:id'],
    'goal.create': ['POST /goals'],
    'goal.update': ['POST /goals/:id/contribute', 'PATCH /goals/:id'],
    'goal.delete': ['POST /goals/:id/cancel'],
    'account.create': ['POST /accounts', 'POST /cards'],
    'account.update': ['PATCH /accounts/:id', 'PATCH /cards/:id'],
    'account.delete': ['POST /accounts/:id/deactivate'],
    'category.create': ['POST /categories', 'POST /categories/apply-defaults'],
    'category.update': ['PATCH /categories/:id'],
    'category.delete': ['POST /categories/:id/deactivate', 'POST /categories/:id/delete'],
    'subscription.create': ['POST /subscriptions'],
    'subscription.update': ['PATCH /subscriptions/:id'],
    'subscription.delete': ['POST /subscriptions/:id/cancel'],
  };

  /**
   * Registered kinds with NO route by design — classified here, never
   * invented as routes (acceptance 4). `statement.delete` has a registry
   * entry but no DELETE /statements endpoint exists.
   */
  const ROUTELESS_KINDS: Record<string, string> = {
    'statement.delete': 'registered in MUTATION_EFFECTS_REGISTRY; no statement-delete route exists — not invented.',
    'budget.delete': 'registered in MUTATION_EFFECTS_REGISTRY; budgets.ts exposes only create/update — not invented.',
  };

  it('every normal-write kind has a receipted route or an explicit routeless classification', () => {
    const ted = new Set<string>(TED_APPROVAL_TOOLS as readonly string[]);
    const normalKinds = (MUTATION_KINDS as readonly string[]).filter((k) => !ted.has(k));
    for (const kind of normalKinds) {
      const routed = KIND_TO_ROUTES[kind];
      const routeless = ROUTELESS_KINDS[kind];
      expect(
        (routed !== undefined && routed.length > 0) || routeless !== undefined,
        `kind "${kind}" has neither a receipted route nor a routeless classification`,
      ).toBe(true);
    }
    // No stale entries: every mapped kind must be a known normal kind.
    for (const kind of Object.keys({ ...KIND_TO_ROUTES, ...ROUTELESS_KINDS })) {
      expect(normalKinds).toContain(kind);
    }
  });

  it('TED-path kinds require operationId (never valid as normal-write receipts)', () => {
    for (const tool of TED_APPROVAL_TOOLS as readonly string[]) {
      const entry = MUTATION_EFFECTS_REGISTRY[tool as MutationKind];
      expect(entry).toBeTruthy();
      // Without operationId a TED-kind receipt fails validation …
      expect(
        mutationReceiptSchema.safeParse({
          mutationId: '00000000-0000-4000-8000-000000000001',
          mutationKind: tool,
          status: 'succeeded',
          affectedTargets: [...entry.affectedTargets],
        }).success,
      ).toBe(false);
      // … with the origin PendingOperation id it validates.
      expect(
        mutationReceiptSchema.safeParse({
          mutationId: '00000000-0000-4000-8000-000000000001',
          mutationKind: tool,
          status: 'succeeded',
          affectedTargets: [...entry.affectedTargets],
          operationId: '00000000-0000-4000-8000-000000000002',
        }).success,
      ).toBe(true);
    }
  });

  /**
   * FIX-P1-RECEIPT-REMAINING-WRITES follow-up CLOSED: the six former gaps
   * (payables bulk/template writes, POST /notifications, POST
   * /categories/apply-defaults) now answer success WITH a normal receipt.
   * Each probe asserts the receipt is PRESENT — if a route regresses to no
   * receipt, this test fails and forces the route back into the receipted
   * inventory above. Never silently widen an unreceipted list: a new
   * unreceipted write must fail here, not grow a gap list.
   */
  it('former gaps: every supported write now carries a receipt (no unreceipted list)', async () => {
    const s = await setupAccountAndCategory();
    const missing: string[] = [];
    const probe = async (label: string, kind: MutationKind, run: () => Promise<{ status: number; body: any }>): Promise<void> => {
      const { status, body } = await run();
      expect(status).toBeGreaterThanOrEqual(200);
      expect(status).toBeLessThan(300);
      if (body.receipt === undefined) {
        missing.push(label);
      } else {
        expectValidNormalReceipt(body, kind);
      }
    };

    await probe('POST /payables/refresh-status', 'payable.update', async () => {
      const res = await s.app.inject({ method: 'POST', url: '/payables/refresh-status', headers: { ...json, 'idempotency-key': 't32-refresh-1' }, payload: {} });
      return { status: res.statusCode, body: res.json() };
    });
    await probe('POST /payables/auto-create-from-templates', 'payable.create', async () => {
      const res = await s.app.inject({ method: 'POST', url: '/payables/auto-create-from-templates?daysAhead=30', headers: { ...json, 'idempotency-key': 't32-auto-create-1' }, payload: {} });
      return { status: res.statusCode, body: res.json() };
    });
    await probe('POST /payables/templates', 'payable.create', async () => {
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
      return { status: res.statusCode, body: res.json() };
    });
    await probe('POST /payables/from-template', 'payable.create', async () => {
      const res = await s.app.inject({
        method: 'POST',
        url: '/payables/from-template',
        headers: { ...json, 'idempotency-key': 't32-from-template-1' },
        payload: { templateName: 'Aluguel template', dueDate: '2026-06-20' },
      });
      return { status: res.statusCode, body: res.json() };
    });
    await probe('POST /notifications', 'payable.update', async () => {
      const res = await s.app.inject({
        method: 'POST',
        url: '/notifications',
        headers: json,
        payload: { chatId: 'chat-1', notificationType: 'daily_summary', enabled: true },
      });
      return { status: res.statusCode, body: res.json() };
    });
    await probe('POST /categories/apply-defaults', 'category.create', async () => {
      const res = await s.app.inject({ method: 'POST', url: '/categories/apply-defaults', headers: json, payload: {} });
      return { status: res.statusCode, body: res.json() };
    });

    // The gap set is EMPTY: every supported write carries a receipt.
    expect(missing).toEqual([]);
  });
});
