import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { CARD_A1, CATEGORY_FOOD_A } from '../fixtures/seed.js';

describe('GET /cards/recurring', () => {
  it('lists recurring purchases with account and status filters, scoped to workspace', async () => {
    const { app } = buildTestApp({
      accounts: [CARD_A1],
      categories: [CATEGORY_FOOD_A],
      transactions: [],
    });

    const created = await app.inject({
      method: 'POST',
      url: '/cards/recurring',
      headers: { 'x-device-token': TOKEN_A },
      payload: {
        accountId: CARD_A1.id,
        description: 'Streaming',
        amountCents: 2990,
        frequency: 'monthly',
        startDate: '2026-01-15',
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({
      method: 'GET',
      url: `/cards/recurring?accountId=${CARD_A1.id}&status=active`,
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      total: 1,
      items: [{ description: 'Streaming', amountCents: 2990, status: 'active' }],
    });

    const otherWorkspace = await app.inject({
      method: 'GET',
      url: '/cards/recurring',
      headers: { 'x-device-token': TOKEN_B },
    });
    expect(otherWorkspace.statusCode).toBe(200);
    expect(otherWorkspace.json()).toEqual({ items: [], total: 0 });
  });
});
