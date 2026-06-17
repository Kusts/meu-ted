import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  ACCOUNT_B1,
  CARD_A1,
  CATEGORY_FOOD_A,
  CATEGORY_RENT_A,
  CATEGORY_FOOD_B,
} from '../fixtures/seed.js';

const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, ACCOUNT_B1, CARD_A1],
  categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A, CATEGORY_FOOD_B],
  transactions: [],
};

/** Deep-clone seed to prevent test contamination via shared object references. */
function freshSeed() {
  return JSON.parse(JSON.stringify(seed)) as typeof seed;
}

function auth(token: string) {
  return { 'x-device-token': token };
}

describe('GET /cards/accounts', () => {
  it('returns only credit_card accounts for the household', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'GET',
      url: '/cards/accounts',
      headers: auth(TOKEN_A),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].kind).toBe('credit_card');
    expect(body.items[0].name).toBe('Nubank Card');
    expect(body.items[0].creditLimitCents).toBe(5_000_00);
    expect(body.items[0].closingDay).toBe(15);
    expect(body.items[0].dueDay).toBe(25);
  });

  it('scopes to household A vs B', async () => {
    const { app } = buildTestApp(freshSeed());
    const a = await app.inject({
      method: 'GET',
      url: '/cards/accounts',
      headers: auth(TOKEN_A),
    });
    const b = await app.inject({
      method: 'GET',
      url: '/cards/accounts',
      headers: auth(TOKEN_B),
    });
    expect(a.json().items).toHaveLength(1);
    expect(b.json().items).toHaveLength(0);
  });

  it('returns empty when no credit cards exist', async () => {
    const { app } = buildTestApp({
      accounts: [ACCOUNT_A1, ACCOUNT_A2],
      categories: [CATEGORY_FOOD_A],
      transactions: [],
    });
    const res = await app.inject({
      method: 'GET',
      url: '/cards/accounts',
      headers: auth(TOKEN_A),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(0);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({ method: 'GET', url: '/cards/accounts' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /cards/statements', () => {
  it('returns empty when no statements exist', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'GET',
      url: '/cards/statements',
      headers: auth(TOKEN_A),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(0);
  });

  it('accepts accountId filter', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'GET',
      url: `/cards/statements?accountId=${CARD_A1.id}`,
      headers: auth(TOKEN_A),
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts status and limit params', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'GET',
      url: '/cards/statements?status=open&limit=5',
      headers: auth(TOKEN_A),
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects invalid status', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'GET',
      url: '/cards/statements?status=invalid',
      headers: auth(TOKEN_A),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /cards/purchases', () => {
  it('creates a purchase on a credit card and returns 201', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        accountId: CARD_A1.id,
        description: 'Supermercado',
        amountCents: 150_00,
        date: '2026-06-10',
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].description).toBe('Supermercado');
    expect(body.items[0].amountCents).toBe(150_00);
    expect(body.items[0].kind).toBe('expense');
  });

  it('returns 400 when account is not a credit card', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        accountId: ACCOUNT_A1.id, // bank account
        description: 'Teste',
        amountCents: 100_00,
        date: '2026-06-10',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates a purchase and the statement appears in list', async () => {
    const { app } = buildTestApp(freshSeed());

    // Create purchase
    await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        accountId: CARD_A1.id,
        description: 'Mercado',
        amountCents: 200_00,
        date: '2026-06-10',
        categoryId: CATEGORY_FOOD_A.id,
      },
    });

    // List statements
    const stmtRes = await app.inject({
      method: 'GET',
      url: `/cards/statements?accountId=${CARD_A1.id}`,
      headers: auth(TOKEN_A),
    });
    expect(stmtRes.statusCode).toBe(200);
    const stmts = stmtRes.json().items;
    expect(stmts.length).toBeGreaterThanOrEqual(1);
  });

  it('deduplicates via idempotency key', async () => {
    const { app } = buildTestApp(freshSeed());
    const key = 'dedup-test-key-001';
    const payload = {
      accountId: CARD_A1.id,
      description: 'Teste idempotency',
      amountCents: 50_00,
      date: '2026-06-10',
    };

    const r1 = await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json', 'idempotency-key': key },
      payload,
    });
    expect(r1.statusCode).toBe(201);

    const r2 = await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json', 'idempotency-key': key },
      payload,
    });
    expect(r2.statusCode).toBe(201);
    expect(r2.headers['idempotent-replayed']).toBe('true');
  });

  it('requires auth', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: { 'Content-Type': 'application/json' },
      payload: {
        accountId: CARD_A1.id,
        description: 'Teste',
        amountCents: 100_00,
        date: '2026-06-10',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates required fields', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: CARD_A1.id }, // missing fields
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /cards/installments', () => {
  it('creates installment purchases and returns 201', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/installments',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
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
    // First installment is month 0, last has remainder absorbed
    expect(body.items[0].installmentNumber).toBe(1);
    expect(body.items[11].installmentNumber).toBe(12);
  });

  it('returns 400 for non-credit-card account', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/installments',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        accountId: ACCOUNT_A1.id,
        description: 'Teste',
        totalAmountCents: 1_000_00,
        purchaseDate: '2026-06-10',
        installmentsTotal: 3,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /cards/recurring', () => {
  it('creates a recurring purchase and returns 201', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/recurring',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
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
    expect(body.frequency).toBe('monthly');
    expect(body.status).toBe('active');
  });

  it('accepts optional endDate', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/recurring',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        accountId: CARD_A1.id,
        description: 'Seguro',
        amountCents: 200_00,
        frequency: 'yearly',
        startDate: '2026-06-15',
        endDate: '2027-06-15',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().endDate).toBe('2027-06-15');
  });

  it('validates frequency enum', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/recurring',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        accountId: CARD_A1.id,
        description: 'Teste',
        amountCents: 100_00,
        frequency: 'weekly', // invalid
        startDate: '2026-06-15',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /cards/statements/:id/pay', () => {
  it('pays a statement and returns 200', async () => {
    const { app } = buildTestApp(freshSeed());

    // First create a purchase to generate a statement
    const purchaseRes = await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        accountId: CARD_A1.id,
        description: 'Compra para pagar',
        amountCents: 500_00,
        date: '2026-06-10',
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(purchaseRes.statusCode).toBe(201);

    // Find the statement
    const stmtRes = await app.inject({
      method: 'GET',
      url: `/cards/statements?accountId=${CARD_A1.id}`,
      headers: auth(TOKEN_A),
    });
    const statementId = stmtRes.json().items[0].id;

    // Pay it
    const payRes = await app.inject({
      method: 'POST',
      url: `/cards/statements/${statementId}/pay`,
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        amountCents: 500_00,
        fromAccountId: ACCOUNT_A1.id,
      },
    });
    expect(payRes.statusCode).toBe(200);
    const paid = payRes.json();
    expect(paid.paidCents).toBe(500_00);
    expect(paid.status).toBe('paid');
  });

  it('returns 400 when paying from a credit card account', async () => {
    const { app } = buildTestApp(freshSeed());

    // Create a purchase first
    const purchaseRes = await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        accountId: CARD_A1.id,
        description: 'Compra',
        amountCents: 200_00,
        date: '2026-06-10',
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    const stmtRes = await app.inject({
      method: 'GET',
      url: `/cards/statements?accountId=${CARD_A1.id}`,
      headers: auth(TOKEN_A),
    });
    const statementId = stmtRes.json().items[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/cards/statements/${statementId}/pay`,
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        amountCents: 200_00,
        fromAccountId: CARD_A1.id, // paying from credit card — invalid
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-existent statement', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/cards/statements/00000000-0000-0000-0000-000000000000/pay',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        amountCents: 100_00,
        fromAccountId: ACCOUNT_A1.id,
      },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /cards/statements/:id (detail)', () => {
  it('returns statement detail with purchases', async () => {
    const { app } = buildTestApp(freshSeed());

    // Create a purchase
    await app.inject({
      method: 'POST',
      url: '/cards/purchases',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {
        accountId: CARD_A1.id,
        description: 'Mercado',
        amountCents: 150_00,
        date: '2026-06-10',
        categoryId: CATEGORY_FOOD_A.id,
      },
    });

    // Find the statement
    const stmtRes = await app.inject({
      method: 'GET',
      url: `/cards/statements?accountId=${CARD_A1.id}`,
      headers: auth(TOKEN_A),
    });
    const statementId = stmtRes.json().items[0].id;

    // Get detail
    const detailRes = await app.inject({
      method: 'GET',
      url: `/cards/statements/${statementId}`,
      headers: auth(TOKEN_A),
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json();
    expect(detail.purchases).toHaveLength(1);
    expect(detail.purchases[0].description).toBe('Mercado');
    expect(detail.purchases[0].amountCents).toBe(150_00);
    expect(detail.totalCents).toBe(150_00);
    expect(detail.status).toMatch(/open|closed/);
  });

  it('returns 404 for non-existent statement', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'GET',
      url: '/cards/statements/00000000-0000-0000-0000-000000000000',
      headers: auth(TOKEN_A),
    });
    expect(res.statusCode).toBe(404);
  });
});
