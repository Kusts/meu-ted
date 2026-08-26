import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';

function iso(daysAgo: number, base = new Date('2026-08-26T12:00:00Z')): string {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

describe('GET /insights/payment-score', () => {
  it('requires authentication (401)', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/insights/payment-score' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with score, onTimeCount, totalCount, period (empty -> score 0)', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app } = buildTestApp({}, clock);
    const res = await app.inject({
      method: 'GET',
      url: '/insights/payment-score?period=90d',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('score');
    expect(body).toHaveProperty('onTimeCount');
    expect(body).toHaveProperty('totalCount');
    expect(body).toHaveProperty('period');
    expect(body.period).toBe('90d');
    // empty -> totalCount 0, score 0 (not error)
    expect(body.totalCount).toBe(0);
    expect(body.score).toBe(0);
  });

  it('calculates on-time ratio for payables last 90 days', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app, state } = buildTestApp({}, clock);
    // payable A1: paid on time (due 10 days ago, paid on due)
    // payable A2: paid late (due 20 days ago, paid 5 days after)
    // payable A3: overdue (due 5 days ago, not paid)
    const dueOnTime = iso(10);
    const dueLate = iso(20);
    const dueOverdue = iso(5);
    const paidOnTime = dueOnTime;
    const paidLate = iso(15); // 5 days after dueLate
    // direct inject into in-memory state._payables (as used by payableStore)
    const anyState = state as any;
    if (!anyState._payables) anyState._payables = [];
    // need accountId for payable creation shape but we bypass store - push raw Payable
    anyState._payables.push(
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', householdId: HOUSEHOLD_A, accountId: '11111111-1111-4111-8111-111111111111', description: 'On time', amountCents: 10000, dueDate: dueOnTime, type: 'one_time', status: 'paid', paidDate: paidOnTime },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', householdId: HOUSEHOLD_A, accountId: '11111111-1111-4111-8111-111111111111', description: 'Late', amountCents: 10000, dueDate: dueLate, type: 'one_time', status: 'paid', paidDate: paidLate },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', householdId: HOUSEHOLD_A, accountId: '11111111-1111-4111-8111-111111111111', description: 'Overdue', amountCents: 10000, dueDate: dueOverdue, type: 'one_time', status: 'overdue' },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/insights/payment-score?days=90',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalCount).toBe(3);
    expect(body.onTimeCount).toBe(1);
    // score = onTime/total *100 rounded
    expect(body.score).toBe(33); // Math.round(1/3*100)=33
  });

  it('validates period 400 on invalid', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app } = buildTestApp({}, clock);
    const res = await app.inject({
      method: 'GET',
      url: '/insights/payment-score?period=invalid',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.error');
  });

  it('validates days out of range', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app } = buildTestApp({}, clock);
    const res = await app.inject({
      method: 'GET',
      url: '/insights/payment-score?days=9999',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
  });

  it('isolates household: payables of B not counted for A', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app, state } = buildTestApp({}, clock);
    const anyState = state as any;
    if (!anyState._payables) anyState._payables = [];
    // B household payable (should not affect A)
    anyState._payables.push(
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', householdId: '00000000-0000-4000-8000-00000000000b', accountId: '11111111-1111-4111-8111-111111111113', description: 'B payable', amountCents: 10000, dueDate: iso(10), type: 'one_time', status: 'paid', paidDate: iso(10) },
    );
    const res = await app.inject({
      method: 'GET',
      url: '/insights/payment-score?period=90d',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().totalCount).toBe(0);
    expect(res.json().score).toBe(0);
    // verify B can see its own
    const resB = await app.inject({
      method: 'GET',
      url: '/insights/payment-score?period=90d',
      headers: { 'x-device-token': TOKEN_B },
    });
    expect(resB.statusCode).toBe(200);
    expect(resB.json().totalCount).toBe(1);
    expect(resB.json().onTimeCount).toBe(1);
    expect(resB.json().score).toBe(100);
  });

  it('supports default period without query (90d)', async () => {
    const clock = () => new Date('2026-08-26T12:00:00Z');
    const { app } = buildTestApp({}, clock);
    const res = await app.inject({
      method: 'GET',
      url: '/insights/payment-score',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().period).toBe('90d');
  });
});
