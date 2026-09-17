import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryGoalStore } from '../../src/goals/in-memory.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import { ACCOUNT_A1, CATEGORY_FOOD_A } from '../fixtures/seed.js';

const seed = { accounts: [ACCOUNT_A1], categories: [CATEGORY_FOOD_A], transactions: [] };
function auth(t: string) { return { 'x-device-token': t }; }

// V4.1 tasks 2.10/2.11 — SPEC §9.6: goal.current == SUM(valid contributions)
// even under 10 concurrent contributions.
describe('V4.1 goals concurrency invariant (SPEC §9.6)', () => {
  it('in-memory: 10 concurrent contributions sum exactly', async () => {
    const { state } = createInMemoryStores();
    const goals = createInMemoryGoalStore(state);
    const goal = await goals.createGoal(HOUSEHOLD_A, {
      name: 'Concorrente', goalType: 'savings', targetAmountCents: 1_000_000, startDate: '2026-09-01',
    });
    const amounts = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    await Promise.all(
      amounts.map((amountCents) =>
        goals.contributeToGoal(HOUSEHOLD_A, goal.id, { amountCents, contributionDate: '2026-09-02' }),
      ),
    );
    const list = await goals.listGoals(HOUSEHOLD_A);
    expect(list[0]!.currentAmountCents).toBe(5500);
  });

  it('route: 10 concurrent POST /goals/:id/contribute sum exactly', async () => {
    const { app } = buildTestApp(seed);
    const create = await app.inject({
      method: 'POST', url: '/goals',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { name: 'Rota concorrente', goalType: 'savings', targetAmountCents: 1_000_000, startDate: '2026-09-01' },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().id;
    const amounts = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const results = await Promise.all(
      amounts.map((amountCents) =>
        app.inject({
          method: 'POST', url: `/goals/${id}/contribute`,
          headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
          payload: { amountCents },
        }),
      ),
    );
    for (const r of results) expect(r.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: '/goals', headers: auth(TOKEN_A) });
    expect(list.json().items[0].currentAmountCents).toBe(5500);
  });

  it('route: contribution to a cancelled goal is rejected', async () => {
    const { app } = buildTestApp(seed);
    const create = await app.inject({
      method: 'POST', url: '/goals',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { name: 'Cancelada', goalType: 'savings', targetAmountCents: 10_000, startDate: '2026-09-01' },
    });
    const id = create.json().id;
    const cancel = await app.inject({
      method: 'POST', url: `/goals/${id}/cancel`,
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: {},
    });
    expect(cancel.statusCode).toBe(200);
    const res = await app.inject({
      method: 'POST', url: `/goals/${id}/contribute`,
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { amountCents: 100 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.invalid');
  });
});
