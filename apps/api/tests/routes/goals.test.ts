import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import { ACCOUNT_A1, CATEGORY_FOOD_A } from '../fixtures/seed.js';

const seed = { accounts: [ACCOUNT_A1], categories: [CATEGORY_FOOD_A], transactions: [] };
function auth(t: string) { return { 'x-device-token': t }; }

describe('GET /goals', () => {
  it('returns empty when no goals', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({ method: 'GET', url: '/goals', headers: auth(TOKEN_A) });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(0);
  });
});

describe('POST /goals', () => {
  it('creates a goal and returns 201', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({ method: 'POST', url: '/goals', headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'Viagem', goalType: 'savings', targetAmountCents: 10_000_00, startDate: '2026-06-01' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('Viagem');
    expect(res.json().currentAmountCents).toBe(0);
    expect(res.json().status).toBe('active');
  });
  it('appears in list after creation', async () => {
    const { app } = buildTestApp(seed);
    await app.inject({ method: 'POST', url: '/goals', headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'Reserva', goalType: 'emergency_fund', targetAmountCents: 5_000_00, startDate: '2026-06-01' } });
    const list = await app.inject({ method: 'GET', url: '/goals', headers: auth(TOKEN_A) });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].name).toBe('Reserva');
  });
});

describe('POST /goals/:id/contribute', () => {
  it('adds contribution and updates current amount', async () => {
    const { app } = buildTestApp(seed);
    const create = await app.inject({ method: 'POST', url: '/goals', headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'Meta', goalType: 'savings', targetAmountCents: 10_000_00, startDate: '2026-06-01' } });
    const id = create.json().id;
    const res = await app.inject({ method: 'POST', url: `/goals/${id}/contribute`, headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { amountCents: 2_000_00 } });
    expect(res.statusCode).toBe(201);
    expect(res.json().amountCents).toBe(2_000_00);
    const list = await app.inject({ method: 'GET', url: '/goals', headers: auth(TOKEN_A) });
    expect(list.json().items[0].currentAmountCents).toBe(2_000_00);
  });
  it('marks goal as achieved when fully funded', async () => {
    const { app } = buildTestApp(seed);
    const create = await app.inject({ method: 'POST', url: '/goals', headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'Pequena', goalType: 'purchase', targetAmountCents: 1_000_00, startDate: '2026-06-01' } });
    const id = create.json().id;
    await app.inject({ method: 'POST', url: `/goals/${id}/contribute`, headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { amountCents: 1_000_00 } });
    const list = await app.inject({ method: 'GET', url: '/goals', headers: auth(TOKEN_A) });
    expect(list.json().items[0].status).toBe('achieved');
  });
});

describe('POST /goals/:id/cancel', () => {
  it('cancels a goal', async () => {
    const { app } = buildTestApp(seed);
    const create = await app.inject({ method: 'POST', url: '/goals', headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'Cancelar', goalType: 'savings', targetAmountCents: 100_00, startDate: '2026-06-01' } });
    const id = create.json().id;
    const res = await app.inject({ method: 'POST', url: `/goals/${id}/cancel`, headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('cancelled');
  });
});

describe('PATCH /goals/:id', () => {
  it('updates name and targetAmountCents', async () => {
    const { app } = buildTestApp(seed);
    const create = await app.inject({ method: 'POST', url: '/goals', headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'Viagem', goalType: 'savings', targetAmountCents: 10_000_00, startDate: '2026-06-01' } });
    const id = create.json().id;

    const res = await app.inject({ method: 'PATCH', url: `/goals/${id}`, headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'Viagem Europa', targetAmountCents: 15_000_00 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Viagem Europa');
    expect(res.json().targetAmountCents).toBe(15_000_00);
  });

  it('updates just name', async () => {
    const { app } = buildTestApp(seed);
    const create = await app.inject({ method: 'POST', url: '/goals', headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'Original', goalType: 'savings', targetAmountCents: 5_000_00, startDate: '2026-06-01' } });
    const id = create.json().id;

    const res = await app.inject({ method: 'PATCH', url: `/goals/${id}`, headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'Renomeado' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Renomeado');
    expect(res.json().targetAmountCents).toBe(5_000_00);
  });

  it('updates just targetAmountCents', async () => {
    const { app } = buildTestApp(seed);
    const create = await app.inject({ method: 'POST', url: '/goals', headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'Reserva', goalType: 'emergency_fund', targetAmountCents: 3_000_00, startDate: '2026-06-01' } });
    const id = create.json().id;

    const res = await app.inject({ method: 'PATCH', url: `/goals/${id}`, headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { targetAmountCents: 6_000_00 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().targetAmountCents).toBe(6_000_00);
    expect(res.json().name).toBe('Reserva');
  });

  it('returns 404 for non-existent goal', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({ method: 'PATCH', url: '/goals/00000000-0000-4000-8000-000000000000', headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'X' } });
    expect(res.statusCode).toBe(404);
  });

  it('validates at least one field', async () => {
    const { app } = buildTestApp(seed);
    const create = await app.inject({ method: 'POST', url: '/goals', headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: { name: 'G', goalType: 'purchase', targetAmountCents: 1_00, startDate: '2026-06-01' } });
    const id = create.json().id;
    const res = await app.inject({ method: 'PATCH', url: `/goals/${id}`, headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: {} });
    expect(res.statusCode).toBe(400);
  });
});
