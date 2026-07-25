import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';

const authA = { 'x-device-token': TOKEN_A, 'content-type': 'application/json' };
const authB = { 'x-device-token': TOKEN_B, 'content-type': 'application/json' };

describe('GET /subscriptions', () => {
  it('returns empty list when no subscriptions exist', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/subscriptions',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(0);
    expect(res.json().total).toBe(0);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/subscriptions' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /subscriptions', () => {
  it('creates a subscription and returns 201', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: authA,
      payload: {
        name: 'Netflix',
        amountCents: 39_90,
        cycle: 'monthly',
        day: 15,
        paymentMethod: 'credit_card',
      },
    });
    expect(res.statusCode).toBe(201);
    const sub = res.json();
    expect(sub.name).toBe('Netflix');
    expect(sub.amountCents).toBe(39_90);
    expect(sub.cycle).toBe('monthly');
    expect(sub.day).toBe(15);
    expect(sub.paymentMethod).toBe('credit_card');
    expect(sub.status).toBe('active');
    expect(sub.id).toBeDefined();
  });

  it('lists the created subscription', async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: authA,
      payload: { name: 'Spotify', amountCents: 19_90, cycle: 'monthly', day: 10, paymentMethod: 'credit_card' },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/subscriptions',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].name).toBe('Spotify');
  });

  it('scopes subscriptions to household', async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: authA,
      payload: { name: 'Netflix', amountCents: 39_90, cycle: 'monthly', day: 15, paymentMethod: 'credit_card' },
    });
    const listB = await app.inject({
      method: 'GET',
      url: '/subscriptions',
      headers: { 'x-device-token': TOKEN_B },
    });
    expect(listB.json().items).toHaveLength(0);
  });

  it('validates required fields', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: authA,
      payload: { name: 'Netflix' }, // missing fields
    });
    expect(res.statusCode).toBe(400);
  });

  it('validates cycle enum', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: authA,
      payload: { name: 'X', amountCents: 100, cycle: 'daily', day: 1, paymentMethod: 'credit_card' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('deduplicates via idempotency key', async () => {
    const { app } = buildTestApp();
    const key = 'sub-idem-key-001';
    const payload = { name: 'Prime', amountCents: 9_90, cycle: 'monthly', day: 1, paymentMethod: 'credit_card' };

    const r1 = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: { ...authA, 'idempotency-key': key },
      payload,
    });
    expect(r1.statusCode).toBe(201);

    const r2 = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: { ...authA, 'idempotency-key': key },
      payload,
    });
    expect(r2.statusCode).toBe(201);
    expect(r2.headers['idempotent-replayed']).toBe('true');
  });
});

describe('POST /subscriptions/:id/cancel', () => {
  it('cancels an active subscription', async () => {
    const { app } = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: authA,
      payload: { name: 'Netflix', amountCents: 39_90, cycle: 'monthly', day: 15, paymentMethod: 'credit_card' },
    });
    const id = created.json().id;

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/subscriptions/${id}/cancel`,
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().status).toBe('cancelled');

    const activeList = await app.inject({
      method: 'GET',
      url: '/subscriptions?status=active',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(activeList.json().items).toHaveLength(0);

    const allList = await app.inject({
      method: 'GET',
      url: '/subscriptions',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(allList.json().items).toHaveLength(1);
    expect(allList.json().items[0].status).toBe('cancelled');
  });

  it('returns 404 for non-existent subscription', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/00000000-0000-4000-8000-000000000000/cancel',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for already cancelled subscription', async () => {
    const { app } = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: authA,
      payload: { name: 'Netflix', amountCents: 39_90, cycle: 'monthly', day: 15, paymentMethod: 'credit_card' },
    });
    const id = created.json().id;

    await app.inject({
      method: 'POST',
      url: `/subscriptions/${id}/cancel`,
      headers: { 'x-device-token': TOKEN_A },
    });

    const secondCancel = await app.inject({
      method: 'POST',
      url: `/subscriptions/${id}/cancel`,
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(secondCancel.statusCode).toBe(400);
  });

  it('filters by cancelled status', async () => {
    const { app } = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: authA,
      payload: { name: 'Spotify', amountCents: 19_90, cycle: 'monthly', day: 10, paymentMethod: 'credit_card' },
    });
    const id = created.json().id;

    await app.inject({
      method: 'POST',
      url: `/subscriptions/${id}/cancel`,
      headers: { 'x-device-token': TOKEN_A },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/subscriptions?status=cancelled',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].status).toBe('cancelled');
  });

  describe('PATCH /subscriptions/:id', () => {
    it('updates all fields on a subscription', async () => {
      const { app } = buildTestApp();
      const created = await app.inject({
        method: 'POST',
        url: '/subscriptions',
        headers: authA,
        payload: { name: 'Netflix', amountCents: 39_90, cycle: 'monthly', day: 15, paymentMethod: 'credit_card' },
      });
      const id = created.json().id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/subscriptions/${id}`,
        headers: authA,
        payload: { name: 'Netflix Premium', amountCents: 55_90, cycle: 'yearly', day: 10, paymentMethod: 'boleto' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('Netflix Premium');
      expect(res.json().amountCents).toBe(55_90);
      expect(res.json().cycle).toBe('yearly');
      expect(res.json().day).toBe(10);
      expect(res.json().paymentMethod).toBe('boleto');
      expect(res.json().status).toBe('active');
    });

    it('updates a single field', async () => {
      const { app } = buildTestApp();
      const created = await app.inject({
        method: 'POST',
        url: '/subscriptions',
        headers: authA,
        payload: { name: 'Spotify', amountCents: 19_90, cycle: 'monthly', day: 10, paymentMethod: 'credit_card' },
      });
      const id = created.json().id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/subscriptions/${id}`,
        headers: authA,
        payload: { amountCents: 24_90 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().amountCents).toBe(24_90);
      expect(res.json().name).toBe('Spotify');
    });

    it('returns 404 for non-existent subscription', async () => {
      const { app } = buildTestApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/subscriptions/00000000-0000-4000-8000-000000000000',
        headers: authA,
        payload: { name: 'Test' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('requires auth', async () => {
      const { app } = buildTestApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/subscriptions/00000000-0000-4000-8000-000000000000',
        payload: { name: 'Test' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('validates at least one field', async () => {
      const { app } = buildTestApp();
      const created = await app.inject({
        method: 'POST',
        url: '/subscriptions',
        headers: authA,
        payload: { name: 'X', amountCents: 100, cycle: 'monthly', day: 1, paymentMethod: 'pix' },
      });
      const id = created.json().id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/subscriptions/${id}`,
        headers: authA,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('scopes update to household', async () => {
      const { app } = buildTestApp();
      const created = await app.inject({
        method: 'POST',
        url: '/subscriptions',
        headers: authA,
        payload: { name: 'Netflix', amountCents: 39_90, cycle: 'monthly', day: 15, paymentMethod: 'credit_card' },
      });
      const id = created.json().id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/subscriptions/${id}`,
        headers: { 'x-device-token': TOKEN_B, 'content-type': 'application/json' },
        payload: { name: 'Hacked' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('can update a cancelled subscription', async () => {
      const { app } = buildTestApp();
      const created = await app.inject({
        method: 'POST',
        url: '/subscriptions',
        headers: authA,
        payload: { name: 'Netflix', amountCents: 39_90, cycle: 'monthly', day: 15, paymentMethod: 'credit_card' },
      });
      const id = created.json().id;

      await app.inject({
        method: 'POST',
        url: `/subscriptions/${id}/cancel`,
        headers: { 'x-device-token': TOKEN_A },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/subscriptions/${id}`,
        headers: authA,
        payload: { name: 'Netflix (cancelada)' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('Netflix (cancelada)');
      expect(res.json().status).toBe('cancelled');
    });
  });
});
