/**
 * V4.1 PHASE 2 (Tasks 2.5–2.9, 2.18) — card ledger hardening, route level.
 *
 * In-memory twin semantics (mirrors the Postgres contracts):
 * - 2.18: POST /cards/recurring applies the SAME validation as a normal
 *   purchase (card exists/active/is_credit_card, category active + expense-kind).
 * - 2.7: PATCH /cards/purchases/:id keeps purchase + linked transaction in
 *   sync (detail read-back reflects the patch; untouched fields preserved).
 * - 2.9: payStatement rejects overpay (amount > remaining → 4xx) and a second
 *   full payment after the invoice is paid.
 */
import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  CARD_A1,
  CATEGORY_FOOD_A,
  CATEGORY_RENT_A,
  CATEGORY_FOOD_B,
  CATEGORY_SALARY_A,
  HOUSEHOLD_A,
} from '../fixtures/seed.js';
import type { Account, Category } from '../../src/types/domain.js';

const INACTIVE_CARD: Account = {
  id: '11111111-1111-4111-8111-111111111115',
  householdId: HOUSEHOLD_A,
  name: 'Old Card',
  kind: 'credit_card',
  balanceCents: 0,
  status: 'inactive',
  creditLimitCents: 5_000_00,
  closingDay: 15,
  dueDay: 25,
};

const INACTIVE_CATEGORY: Category = {
  id: '22222222-2222-4222-8222-222222222225',
  householdId: HOUSEHOLD_A,
  name: 'Velha',
  kind: 'expense',
  status: 'inactive',
};

const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, CARD_A1, INACTIVE_CARD],
  categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A, CATEGORY_SALARY_A, CATEGORY_FOOD_B, INACTIVE_CATEGORY],
  transactions: [],
};

function freshSeed() {
  return JSON.parse(JSON.stringify(seed)) as typeof seed;
}

function auth(token: string = TOKEN_A) {
  return { 'x-device-token': token, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() };
}

const recurring = (overrides: Record<string, unknown> = {}) => ({
  accountId: CARD_A1.id,
  description: 'Netflix',
  amountCents: 39_90,
  frequency: 'monthly',
  startDate: '2026-06-15',
  categoryId: CATEGORY_FOOD_A.id,
  ...overrides,
});

describe('2.18 recurring purchase validation mirrors the normal purchase path', () => {
  it('rejects an unknown card with 404', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST', url: '/cards/recurring', headers: auth(),
      payload: recurring({ accountId: '00000000-0000-4000-8000-00000000ffff' }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a non-credit-card account with 400', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST', url: '/cards/recurring', headers: auth(),
      payload: recurring({ accountId: ACCOUNT_A1.id }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an inactive card with 404', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST', url: '/cards/recurring', headers: auth(),
      payload: recurring({ accountId: INACTIVE_CARD.id }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a card from another household with 404', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST', url: '/cards/recurring', headers: auth(TOKEN_B),
      payload: recurring({}),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an income-kind category with 400', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST', url: '/cards/recurring', headers: auth(),
      payload: recurring({ categoryId: CATEGORY_SALARY_A.id }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an inactive category with 404', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST', url: '/cards/recurring', headers: auth(),
      payload: recurring({ categoryId: INACTIVE_CATEGORY.id }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a category from another household with 404', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST', url: '/cards/recurring', headers: auth(),
      payload: recurring({ categoryId: CATEGORY_FOOD_B.id }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('accepts a valid recurring purchase (control)', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST', url: '/cards/recurring', headers: auth(),
      payload: recurring({}),
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('2.7 purchase PATCH keeps purchase + transaction in sync', () => {
  // V4.1 REVIEWFIX F7: PATCH requires an open statement — use a future
  // purchase date so computeStatus yields 'open' regardless of wall-clock.
  const futureDate = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
  const createPurchase = async (app: ReturnType<typeof buildTestApp>['app']) => {
    const create = await app.inject({
      method: 'POST', url: '/cards/purchases', headers: auth(),
      payload: {
        accountId: CARD_A1.id, description: 'Mercado', amountCents: 150_00,
        date: futureDate, categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(create.statusCode).toBe(201);
    const purchaseId = create.json().items[0].id as string;
    const stmtId = (await app.inject({
      method: 'GET', url: `/cards/statements?accountId=${CARD_A1.id}`, headers: auth(),
    })).json().items[0].id as string;
    return { purchaseId, stmtId };
  };

  it('patching amount is reflected in the statement detail + total', async () => {
    const { app, state } = buildTestApp(freshSeed());
    const { purchaseId, stmtId } = await createPurchase(app);
    const patch = await app.inject({
      method: 'PATCH', url: `/cards/purchases/${purchaseId}`, headers: auth(),
      payload: { amountCents: 200_00 },
    });
    expect(patch.statusCode).toBe(200);
    const detail = await app.inject({ method: 'GET', url: `/cards/statements/${stmtId}`, headers: auth() });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().purchases[0].amountCents).toBe(200_00);
    expect(detail.json().totalCents).toBe(200_00);
    // The ledger row itself carries the patch.
    const tx = state.transactions.find((t) => t.id === purchaseId);
    expect(tx?.amountCents).toBe(200_00);
  });

  it('patching description only preserves amount and date', async () => {
    const { app } = buildTestApp(freshSeed());
    const { purchaseId, stmtId } = await createPurchase(app);
    const patch = await app.inject({
      method: 'PATCH', url: `/cards/purchases/${purchaseId}`, headers: auth(),
      payload: { description: 'Feira' },
    });
    expect(patch.statusCode).toBe(200);
    const detail = await app.inject({ method: 'GET', url: `/cards/statements/${stmtId}`, headers: auth() });
    expect(detail.json().purchases[0].description).toBe('Feira');
    expect(detail.json().purchases[0].amountCents).toBe(150_00);
    expect(detail.json().purchases[0].date).toBe(futureDate);
    expect(detail.json().totalCents).toBe(150_00);
  });

  it('patching category is reflected in the detail', async () => {
    const { app } = buildTestApp(freshSeed());
    const { purchaseId, stmtId } = await createPurchase(app);
    const patch = await app.inject({
      method: 'PATCH', url: `/cards/purchases/${purchaseId}`, headers: auth(),
      payload: { categoryId: CATEGORY_RENT_A.id },
    });
    expect(patch.statusCode).toBe(200);
    const detail = await app.inject({ method: 'GET', url: `/cards/statements/${stmtId}`, headers: auth() });
    expect(detail.json().purchases[0].categoryId ?? detail.json().purchases[0].categoryName).toBeDefined();
    const tx = detail.json().purchases[0];
    expect(tx.categoryId === CATEGORY_RENT_A.id || tx.categoryName === 'Aluguel').toBe(true);
  });

  it('FINAL REVIEW: patching to an income-kind or inactive category is rejected (M-05 parity)', async () => {
    const { app } = buildTestApp(freshSeed());
    const { purchaseId } = await createPurchase(app);
    const wrongKind = await app.inject({
      method: 'PATCH', url: `/cards/purchases/${purchaseId}`, headers: auth(),
      payload: { categoryId: CATEGORY_SALARY_A.id },
    });
    expect(wrongKind.statusCode).toBe(400);
    const inactive = await app.inject({
      method: 'PATCH', url: `/cards/purchases/${purchaseId}`, headers: auth(),
      payload: { categoryId: INACTIVE_CATEGORY.id },
    });
    expect(inactive.statusCode).toBe(404);
  });
});

describe('2.9 statement payment guards (single-node semantics)', () => {
  const setupPaid = async () => {
    const { app } = buildTestApp(freshSeed());
    const create = await app.inject({
      method: 'POST', url: '/cards/purchases', headers: auth(),
      payload: {
        accountId: CARD_A1.id, description: 'Compra', amountCents: 500_00,
        date: '2026-06-10', categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(create.statusCode).toBe(201);
    const stmtId = (await app.inject({
      method: 'GET', url: `/cards/statements?accountId=${CARD_A1.id}`, headers: auth(),
    })).json().items[0].id as string;
    return { app, stmtId };
  };

  it('rejects overpay (amount > remaining) with 4xx', async () => {
    const { app, stmtId } = await setupPaid();
    const res = await app.inject({
      method: 'POST', url: `/cards/statements/${stmtId}/pay`, headers: auth(),
      payload: { amountCents: 600_00, fromAccountId: ACCOUNT_A1.id },
    });
    expect([400, 409, 422]).toContain(res.statusCode);
  });

  it('a second full payment after paid is rejected', async () => {
    const { app, stmtId } = await setupPaid();
    const first = await app.inject({
      method: 'POST', url: `/cards/statements/${stmtId}/pay`, headers: auth(),
      payload: { amountCents: 500_00, fromAccountId: ACCOUNT_A1.id },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST', url: `/cards/statements/${stmtId}/pay`, headers: auth(),
      payload: { amountCents: 500_00, fromAccountId: ACCOUNT_A1.id },
    });
    expect([400, 409, 422]).toContain(second.statusCode);
  });

  it('partial then exact remainder succeeds and pays the invoice', async () => {
    const { app, stmtId } = await setupPaid();
    const p1 = await app.inject({
      method: 'POST', url: `/cards/statements/${stmtId}/pay`, headers: auth(),
      payload: { amountCents: 200_00, fromAccountId: ACCOUNT_A1.id },
    });
    expect(p1.statusCode).toBe(200);
    expect(p1.json().paidCents).toBe(200_00);
    const p2 = await app.inject({
      method: 'POST', url: `/cards/statements/${stmtId}/pay`, headers: auth(),
      payload: { amountCents: 300_00, fromAccountId: ACCOUNT_A1.id },
    });
    expect(p2.statusCode).toBe(200);
    expect(p2.json().paidCents).toBe(500_00);
    expect(p2.json().status).toBe('paid');
  });
});

describe('DEBT1 full statement payment persists paidCents === total + payment expense', () => {
  it('quitar integralmente nunca resulta em paid com paidCents=0', async () => {
    const { app, state } = buildTestApp(freshSeed());
    const create = await app.inject({
      method: 'POST', url: '/cards/purchases', headers: auth(),
      payload: {
        accountId: CARD_A1.id, description: 'Compra DEBT1', amountCents: 500_00,
        date: '2026-06-10', categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(create.statusCode).toBe(201);
    const stmtId = (await app.inject({
      method: 'GET', url: `/cards/statements?accountId=${CARD_A1.id}`, headers: auth(),
    })).json().items[0].id as string;
    const before = await app.inject({ method: 'GET', url: `/cards/statements/${stmtId}`, headers: auth() });
    expect(before.statusCode).toBe(200);
    const total = before.json().totalCents as number;
    // Valor fixo da compra DEBT1 (500_00), não apenas "maior que zero".
    expect(total).toBe(500_00);
    expect(before.json().paidCents).toBe(0);

    const balanceOfPayer = () =>
      state.accounts.find((a) => a.id === ACCOUNT_A1.id)!.balanceCents;
    const balanceBefore = balanceOfPayer();
    const txCountBefore = state.transactions.length;
    const pay = await app.inject({
      method: 'POST', url: `/cards/statements/${stmtId}/pay`,
      headers: { ...auth(), 'idempotency-key': 'debt1-full-pay-001' },
      payload: { amountCents: total, fromAccountId: ACCOUNT_A1.id },
    });
    expect(pay.statusCode).toBe(200);
    const paid = pay.json();
    expect(paid.status).toBe('paid');
    expect(paid.totalCents).toBe(total);
    expect(paid.paidCents).toBe(total);
    // Anti-regressão explícita: paid jamais com zero.
    expect(paid.paidCents).toBeGreaterThan(0);
    expect(paid.paidCents).not.toBe(0);

    // Estado persistido (não só a resposta do POST): reler o detalhe.
    const detail = await app.inject({ method: 'GET', url: `/cards/statements/${stmtId}`, headers: auth() });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().status).toBe('paid');
    expect(detail.json().totalCents).toBe(total);
    expect(detail.json().paidCents).toBe(total);
    expect(detail.json().paidCents).not.toBe(0);

    // Débito exato da conta pagadora.
    const balanceAfter = balanceOfPayer();
    expect(balanceAfter - balanceBefore).toBe(-total);
    expect(balanceAfter).toBe(balanceBefore - 500_00);

    // Exatamente uma nova transação: a despesa de pagamento.
    expect(state.transactions.length).toBe(txCountBefore + 1);
    const newTx = state.transactions.slice(txCountBefore);
    expect(newTx).toHaveLength(1);
    expect(newTx[0].accountId).toBe(ACCOUNT_A1.id);
    expect(newTx[0].kind).toBe('expense');
    expect(newTx[0].amountCents).toBe(total);
    expect(newTx[0].amountCents).toBe(500_00);
    expect(newTx[0].description.startsWith('Pagamento fatura')).toBe(true);
  });
});

describe('2.5 updateCard per-field isolation (route level control)', () => {
  it('updating name only preserves limit and days', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'PATCH', url: `/cards/${CARD_A1.id}`, headers: auth(),
      payload: { name: 'Renomeado' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Renomeado');
    expect(body.creditLimitCents).toBe(5_000_00);
    expect(body.closingDay).toBe(15);
    expect(body.dueDay).toBe(25);
  });

  it('updating closingDay only preserves the rest', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'PATCH', url: `/cards/${CARD_A1.id}`, headers: auth(),
      payload: { closingDay: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.closingDay).toBe(5);
    expect(body.name).toBe('Nubank Card');
    expect(body.creditLimitCents).toBe(5_000_00);
    expect(body.dueDay).toBe(25);
  });
});
