/**
 * FIX-P1-RECEIPT-CARD-UNDO — card/statement MutationReceipts (SPEC §15.1).
 *
 * Every supported card/statement write that alters financial data must
 * return a browser-safe receipt (API-generated mutationId, registry-derived
 * affectedTargets, NEVER operationId). TDD RED-first: only
 * POST /cards/statements/:id/pay carries a receipt today.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  CARD_A1,
  CATEGORY_FOOD_A,
  CATEGORY_RENT_A,
} from '../fixtures/seed.js';
import {
  FORBIDDEN_BROWSER_KEYS,
  MUTATION_EFFECTS_REGISTRY,
  mutationReceiptSchema,
  type MutationKind,
} from '@pi-finance/llm-contracts';

const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, CARD_A1],
  categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A],
  transactions: [],
};

const freshSeed = () => JSON.parse(JSON.stringify(seed)) as typeof seed;
const auth = (token: string) => ({ 'x-device-token': token });
const json = { ...auth(TOKEN_A), 'Content-Type': 'application/json' };

/** Purchase date guaranteed to land on an OPEN statement (mirrors routes/cards.test.ts). */
const openPurchaseDate = (): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 35);
  return d.toISOString().slice(0, 10);
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

const createPurchase = async (app: ReturnType<typeof buildTestApp>['app'], overrides: Record<string, unknown> = {}) => {
  const res = await app.inject({
    method: 'POST',
    url: '/cards/purchases',
    headers: { ...json, 'idempotency-key': crypto.randomUUID() },
    payload: {
      accountId: CARD_A1.id,
      description: 'Mercado',
      amountCents: 150_00,
      date: '2026-06-10',
      categoryId: CATEGORY_FOOD_A.id,
      ...overrides,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
};

describe('card/statement write receipts', () => {
  it('POST /cards/purchases returns a transaction.create receipt', async () => {
    const { app } = buildTestApp(freshSeed());
    const body = await createPurchase(app);
    expect(body.items).toHaveLength(1);
    expectValidNormalReceipt(body, 'transaction.create');
    expect(body.receipt.entity).toEqual({ type: 'transaction', id: body.items[0].id });
  });

  it('POST /cards/purchases: two writes differ; keyed replay preserves mutationId', async () => {
    const { app } = buildTestApp(freshSeed());
    const first = await createPurchase(app, { description: 'A' });
    const second = await createPurchase(app, { description: 'B' });
    expect(first.receipt.mutationId).not.toBe(second.receipt.mutationId);

    const key = 'card-purchase-idem-1';
    const payload = {
      accountId: CARD_A1.id,
      description: 'Idem',
      amountCents: 10_00,
      date: '2026-06-10',
    };
    const headers = { ...json, 'idempotency-key': key };
    const r1 = await app.inject({ method: 'POST', url: '/cards/purchases', headers, payload });
    const r2 = await app.inject({ method: 'POST', url: '/cards/purchases', headers, payload });
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r2.headers['idempotent-replayed']).toBe('true');
    expect(r2.json().receipt.mutationId).toBe(r1.json().receipt.mutationId);
    expectValidNormalReceipt(r2.json(), 'transaction.create');
  });

  it('POST /cards/installments returns a transaction.create receipt', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/installments',
      headers: { ...json, 'idempotency-key': crypto.randomUUID() },
      payload: {
        accountId: CARD_A1.id,
        description: 'Notebook 12x',
        totalAmountCents: 6_000_00,
        purchaseDate: '2026-06-10',
        installmentsTotal: 12,
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.items).toHaveLength(12);
    expectValidNormalReceipt(body, 'transaction.create');
    expect(body.receipt.entity).toEqual({ type: 'transaction', id: body.items[0].id });
  });

  it('POST /cards/recurring returns a statement.create receipt', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/recurring',
      headers: { ...json, 'idempotency-key': crypto.randomUUID() },
      payload: {
        accountId: CARD_A1.id,
        description: 'Netflix',
        amountCents: 39_90,
        frequency: 'monthly',
        startDate: '2026-06-15',
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.description).toBe('Netflix');
    expectValidNormalReceipt(body, 'statement.create');
    expect(body.receipt.entity).toEqual({ type: 'recurring-purchase', id: body.id });
  });

  it('POST /cards returns an account.create receipt', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards',
      headers: { ...json, 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'Novo Cartão', creditLimitCents: 10_000_00, closingDay: 10, dueDay: 20 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.kind).toBe('credit_card');
    expectValidNormalReceipt(body, 'account.create');
    expect(body.receipt.entity).toEqual({ type: 'account', id: body.id });
  });

  it('PATCH /cards/:id returns an account.update receipt', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'PATCH',
      url: `/cards/${CARD_A1.id}`,
      headers: { ...json, 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'Renomeado' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Renomeado');
    expectValidNormalReceipt(body, 'account.update');
    expect(body.receipt.entity).toEqual({ type: 'account', id: CARD_A1.id });
  });

  it('PATCH /cards/purchases/:id returns a transaction.update receipt', async () => {
    const { app } = buildTestApp(freshSeed());
    // V4.1 REVIEWFIX F7: PATCH requires an open statement.
    const created = await createPurchase(app, { date: openPurchaseDate() });
    const purchaseId = created.items[0].id as string;
    const res = await app.inject({
      method: 'PATCH',
      url: `/cards/purchases/${purchaseId}`,
      headers: { ...json, 'idempotency-key': crypto.randomUUID() },
      payload: { description: 'Mercado editado' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expectValidNormalReceipt(body, 'transaction.update');
    expect(body.receipt.entity).toEqual({ type: 'transaction', id: purchaseId });
  });

  it('DELETE /cards/purchases/:id returns 200 with a transaction.delete receipt', async () => {
    const { app } = buildTestApp(freshSeed());
    const created = await createPurchase(app, { description: 'Compra cancelável', date: openPurchaseDate() });
    const purchaseId = created.items[0].id as string;
    const res = await app.inject({
      method: 'DELETE',
      url: `/cards/purchases/${purchaseId}`,
      headers: { ...auth(TOKEN_A), 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(purchaseId);
    expectValidNormalReceipt(body, 'transaction.delete');
    expect(body.receipt.entity).toEqual({ type: 'transaction', id: purchaseId });
    // Cancel semantics preserved: purchase hidden from statement detail.
    const stmtId = (
      await app.inject({ method: 'GET', url: `/cards/statements?accountId=${CARD_A1.id}`, headers: auth(TOKEN_A) })
    ).json().items[0].id as string;
    const detail = await app.inject({ method: 'GET', url: `/cards/statements/${stmtId}`, headers: auth(TOKEN_A) });
    expect(detail.json().purchases).toHaveLength(0);
  });

  it('POST /cards/statements/:id/pay keeps its statement.update receipt (regression lock)', async () => {
    const { app } = buildTestApp(freshSeed());
    await createPurchase(app, { description: 'Compra para pagar', amountCents: 500_00 });
    const statementId = (
      await app.inject({ method: 'GET', url: `/cards/statements?accountId=${CARD_A1.id}`, headers: auth(TOKEN_A) })
    ).json().items[0].id as string;
    const res = await app.inject({
      method: 'POST',
      url: `/cards/statements/${statementId}/pay`,
      headers: { ...json, 'idempotency-key': crypto.randomUUID() },
      payload: { amountCents: 500_00, fromAccountId: ACCOUNT_A1.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.paidCents).toBe(500_00);
    expectValidNormalReceipt(body, 'statement.update');
    expect(body.receipt.entity).toEqual({ type: 'statement', id: statementId });
  });
});
