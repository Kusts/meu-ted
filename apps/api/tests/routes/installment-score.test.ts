import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';

// Helper to create a credit card statement + purchases for installment-score tests
async function seedInstallments(state: any, householdId: string, month: string, entries: Array<{ status: string; date: string }>) {
  // Use cardStore via state internals: we manually inject statements + cardPurchases/transactions
  if (!state._statements) state._statements = [];
  if (!state._cardPurchases) state._cardPurchases = [];
  if (!state.transactions) state.transactions = [];
  // ensure card account exists for household
  let card = state.accounts.find((a: any) => a.householdId === householdId && a.kind === 'credit_card');
  if (!card) {
    card = {
      id: householdId === HOUSEHOLD_A ? '11111111-1111-4111-8111-111111111114' : '11111111-1111-4111-8111-111111111115',
      householdId,
      name: 'Card Test',
      kind: 'credit_card',
      balanceCents: 0,
      status: 'active',
      creditLimitCents: 500000,
      closingDay: 15,
      dueDay: 25,
    };
    state.accounts.push(card);
  }
  // For each entry, create a statement per closing cycle + purchase
  // Simplify: compute closingDate from entry.date + closingDay
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    // create statement id deterministically for month = cycleYearMonth
    const cycle = e.date.slice(0, 7);
    const stmtId = `stmt-${householdId.slice(0, 8)}-${cycle}-${i}`;
    let stmt = state._statements.find((s: any) => s.id === stmtId);
    if (!stmt) {
      stmt = {
        id: stmtId,
        householdId,
        accountId: card.id,
        cycleYearMonth: cycle,
        closingDate: `${cycle}-15`,
        dueDate: `${cycle}-25`,
        totalCents: 0,
        paidCents: e.status === 'paid' ? 10000 : 0,
        status: e.status,
      };
      state._statements.push(stmt);
    } else {
      stmt.status = e.status;
      stmt.paidCents = e.status === 'paid' ? 10000 : 0;
    }
    const purchaseId = `purchase-${householdId.slice(0, 8)}-${e.date}-${i}`;
    // push as cardPurchases (primary source for getStatementDetail)
    state._cardPurchases.push({
      id: purchaseId,
      statementId: stmt.id,
      description: `Installment ${i}`,
      amountCents: 10000,
      date: e.date,
    });
    stmt.totalCents += 10000;
  }
}

describe('GET /insights/installment-score', () => {
  it('requires authentication (401)', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/insights/installment-score?month=2026-08' });
    expect(res.statusCode).toBe(401);
  });

  it('validates month required -> 400', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/insights/installment-score',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.error');
  });

  it('validates month format invalid -> 400', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/insights/installment-score?month=2026-13',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.error');
  });

  it('validates month format garbage -> 400', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/insights/installment-score?month=invalid',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 with score, month, installments {total,paid,overdue,score} empty -> 0', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app } = buildTestApp({}, clock);
    const res = await app.inject({
      method: 'GET',
      url: '/insights/installment-score?month=2026-08',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('score');
    expect(body).toHaveProperty('month');
    expect(body).toHaveProperty('installments');
    expect(body.month).toBe('2026-08');
    expect(body.installments).toHaveProperty('total');
    expect(body.installments).toHaveProperty('paid');
    expect(body.installments).toHaveProperty('overdue');
    expect(body.installments).toHaveProperty('score');
    expect(body.installments.total).toBe(0);
    expect(body.score).toBe(0);
    expect(body.installments.score).toBe(0);
  });

  it('calculates 100% when all paid in month', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app, state } = buildTestApp({}, clock);
    await seedInstallments(state, HOUSEHOLD_A, '2026-08', [
      { status: 'paid', date: '2026-08-05' },
      { status: 'paid', date: '2026-08-10' },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: '/insights/installment-score?month=2026-08',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.installments.total).toBe(2);
    expect(body.installments.paid).toBe(2);
    expect(body.installments.overdue).toBe(0);
    expect(body.score).toBe(100);
    expect(body.installments.score).toBe(100);
  });

  it('calculates parcial 50% (1 paid 1 overdue)', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app, state } = buildTestApp({}, clock);
    await seedInstallments(state, HOUSEHOLD_A, '2026-08', [
      { status: 'paid', date: '2026-08-05' },
      { status: 'overdue', date: '2026-08-15' },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: '/insights/installment-score?month=2026-08',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.installments.total).toBe(2);
    expect(body.installments.paid).toBe(1);
    expect(body.installments.overdue).toBe(1);
    expect(body.score).toBe(50);
  });

  it('calculates 0% when all overdue', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app, state } = buildTestApp({}, clock);
    await seedInstallments(state, HOUSEHOLD_A, '2026-08', [
      { status: 'overdue', date: '2026-08-05' },
      { status: 'overdue', date: '2026-08-12' },
      { status: 'overdue', date: '2026-08-20' },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: '/insights/installment-score?month=2026-08',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.installments.total).toBe(3);
    expect(body.installments.paid).toBe(0);
    expect(body.installments.overdue).toBe(3);
    expect(body.score).toBe(0);
  });

  it('isolates household: B installments not counted for A', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app, state } = buildTestApp({}, clock);
    const HOUSEHOLD_B = '00000000-0000-4000-8000-00000000000b';
    await seedInstallments(state, HOUSEHOLD_B, '2026-08', [
      { status: 'paid', date: '2026-08-05' },
    ]);
    const resA = await app.inject({
      method: 'GET',
      url: '/insights/installment-score?month=2026-08',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(resA.statusCode).toBe(200);
    expect(resA.json().installments.total).toBe(0);
    expect(resA.json().score).toBe(0);

    const resB = await app.inject({
      method: 'GET',
      url: '/insights/installment-score?month=2026-08',
      headers: { 'x-device-token': TOKEN_B },
    });
    expect(resB.statusCode).toBe(200);
    expect(resB.json().installments.total).toBe(1);
    expect(resB.json().installments.paid).toBe(1);
    expect(resB.json().score).toBe(100);
  });

  it('filters by month: only 2026-08 counted, not 2026-07', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app, state } = buildTestApp({}, clock);
    await seedInstallments(state, HOUSEHOLD_A, '2026-08', [
      { status: 'paid', date: '2026-08-05' },
      { status: 'paid', date: '2026-07-05' },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: '/insights/installment-score?month=2026-08',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().installments.total).toBe(1);
    expect(res.json().score).toBe(100);
  });
});
