import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A, } from '../test-app.js';
import { ACCOUNT_A1, ACCOUNT_A2, ACCOUNT_B1, CATEGORY_FOOD_A, } from '../fixtures/seed.js';

const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, ACCOUNT_B1],
  categories: [CATEGORY_FOOD_A],
  transactions: [],
};

function auth(token: string) { return { 'x-device-token': token }; }

describe('GET /payables', () => {
  it('returns empty when no payables exist', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({ method: 'GET', url: '/payables', headers: auth(TOKEN_A) });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(0);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({ method: 'GET', url: '/payables' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /payables', () => {
  it('creates a one_time payable', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Luz', amountCents: 185_00, dueDate: '2026-07-10' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().description).toBe('Luz');
    expect(res.json().type).toBe('one_time');
    expect(res.json().status).toBe('pending');
  });

  it('creates a recurring payable with frequency', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Internet', amountCents: 99_90, dueDate: '2026-07-15', type: 'recurring', frequency: 'monthly', reminderDaysBefore: 3 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().type).toBe('recurring');
    expect(res.json().frequency).toBe('monthly');
  });

  it('creates template when templateName is provided', async () => {
    const { app } = buildTestApp(seed);
    await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Netflix', amountCents: 39_90, dueDate: '2026-07-15', type: 'recurring', frequency: 'monthly', templateName: 'Netflix' },
    });
    const tRes = await app.inject({ method: 'GET', url: '/payables/templates', headers: auth(TOKEN_A) });
    expect(tRes.json().items).toHaveLength(1);
    expect(tRes.json().items[0].name).toBe('Netflix');
  });

  it('appears in list after creation', async () => {
    const { app } = buildTestApp(seed);
    await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Aluguel', amountCents: 2_400_00, dueDate: '2026-07-05' },
    });
    const list = await app.inject({ method: 'GET', url: '/payables', headers: auth(TOKEN_A) });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].description).toBe('Aluguel');
  });

  it('validates required fields', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it('deduplicates via idempotency key', async () => {
    const { app } = buildTestApp(seed);
    const key = 'dedup-payable-001';
    const payload = { accountId: ACCOUNT_A1.id, description: 'Test', amountCents: 100_00, dueDate: '2026-07-01' };
    const r1 = await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json', 'idempotency-key': key },
      payload,
    });
    expect(r1.statusCode).toBe(201);
    const r2 = await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json', 'idempotency-key': key },
      payload,
    });
    expect(r2.statusCode).toBe(201);
    expect(r2.headers['idempotent-replayed']).toBe('true');
  });
});

describe('POST /payables/:id/pay', () => {
  it('marks payable as paid and creates expense', async () => {
    const { app, state } = buildTestApp(seed);
    const create = await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Luz', amountCents: 185_00, dueDate: '2026-06-01' },
    });
    const id = create.json().id;

    const pay = await app.inject({
      method: 'POST', url: `/payables/${id}/pay`,
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { paidDate: '2026-06-01' },
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().status).toBe('paid');
    expect(pay.json().paidDate).toBe('2026-06-01');

    // Check expense was created
    const expenseTx = state.transactions.find(t => t.description === 'Luz' && t.kind === 'expense');
    expect(expenseTx).toBeTruthy();
    expect(expenseTx!.amountCents).toBe(185_00);
  });

  it('auto-creates next recurring payable after payment', async () => {
    const { app } = buildTestApp(seed, () => new Date('2026-06-15T12:00:00Z'));
    const create = await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Internet', amountCents: 99_90, dueDate: '2026-06-15', type: 'recurring', frequency: 'monthly' },
    });
    const id = create.json().id;

    await app.inject({
      method: 'POST', url: `/payables/${id}/pay`,
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {},
    });

    const list = await app.inject({ method: 'GET', url: '/payables', headers: auth(TOKEN_A) });
    expect(list.json().items.length).toBeGreaterThanOrEqual(1);
    const next = list.json().items.find((p: any) => p.status === 'pending' && p.description === 'Internet');
    expect(next).toBeTruthy();
    expect(next.dueDate).toBe('2026-07-15');
  });

  it('returns 404 for non-existent payable', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'POST', url: '/payables/00000000-0000-0000-0000-000000000000/pay',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /payables/:id/cancel', () => {
  it('cancels a payable', async () => {
    const { app } = buildTestApp(seed);
    const create = await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Cancelar', amountCents: 50_00, dueDate: '2026-07-01' },
    });
    const id = create.json().id;

    const cancel = await app.inject({
      method: 'POST', url: `/payables/${id}/cancel`,
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { reason: 'Não precisa mais' },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe('cancelled');
  });
});

describe('GET /payables/templates', () => {
  it('lists templates', async () => {
    const { app } = buildTestApp(seed);
    // Create a template
    await app.inject({
      method: 'POST', url: '/payables/templates',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, name: 'Luz', description: 'Conta de luz', amountCents: 185_00, frequency: 'monthly', dayOfMonth: 10 },
    });
    const res = await app.inject({ method: 'GET', url: '/payables/templates', headers: auth(TOKEN_A) });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].name).toBe('Luz');
  });
});

describe('POST /payables/from-template', () => {
  it('creates payable from a template', async () => {
    const { app } = buildTestApp(seed);
    await app.inject({
      method: 'POST', url: '/payables/templates',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, name: 'Netflix', description: 'Netflix', amountCents: 39_90, frequency: 'monthly', dayOfMonth: 15 },
    });

    const res = await app.inject({
      method: 'POST', url: '/payables/from-template',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json', 'idempotency-key': 'from-template-1' },
      payload: { templateName: 'Netflix', dueDate: '2026-07-15' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().description).toBe('Netflix');
    expect(res.json().amountCents).toBe(39_90);
    expect(res.json().type).toBe('recurring');
  });

  it('supports amount override', async () => {
    const { app } = buildTestApp(seed);
    await app.inject({
      method: 'POST', url: '/payables/templates',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, name: 'Luz', description: 'Luz', amountCents: 185_00, frequency: 'monthly', dayOfMonth: 10 },
    });
    const res = await app.inject({
      method: 'POST', url: '/payables/from-template',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json', 'idempotency-key': 'from-template-2' },
      payload: { templateName: 'Luz', dueDate: '2026-07-10', amountOverrideCents: 200_00 },
    });
    expect(res.json().amountCents).toBe(200_00);
  });

  it('returns 404 for unknown template', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'POST', url: '/payables/from-template',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json', 'idempotency-key': 'from-template-3' },
      payload: { templateName: 'Inexistente', dueDate: '2026-07-01' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /payables/reminders', () => {
  it('returns overdue and pending due today', async () => {
    const { app } = buildTestApp(seed);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Vencida', amountCents: 100_00, dueDate: yesterday },
    });
    await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Hoje', amountCents: 50_00, dueDate: today },
    });

    const res = await app.inject({ method: 'GET', url: '/payables/reminders', headers: auth(TOKEN_A) });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /notifications', () => {
  it('returns empty when no configs', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({ method: 'GET', url: '/notifications', headers: auth(TOKEN_A) });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(0);
  });
});

describe('POST /notifications', () => {
  it('creates a notification config', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'POST', url: '/notifications',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { chatId: 'chat-1', notificationType: 'overdue_reminder', enabled: true, scheduleHour: 9, thresholdDays: 1 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().notificationType).toBe('overdue_reminder');
    expect(res.json().enabled).toBe(true);
  });

  it('updates existing config', async () => {
    const { app } = buildTestApp(seed);
    await app.inject({
      method: 'POST', url: '/notifications',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { chatId: 'chat-1', notificationType: 'overdue_reminder', enabled: true },
    });
    const update = await app.inject({
      method: 'POST', url: '/notifications',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { chatId: 'chat-1', notificationType: 'overdue_reminder', enabled: false },
    });
    expect(update.statusCode).toBe(201);
    expect(update.json().enabled).toBe(false);
  });
});

describe('GET /payables — filters', () => {
  it('filters by status', async () => {
    const { app } = buildTestApp(seed);
    await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Paga', amountCents: 100_00, dueDate: '2026-12-15' },
    });
    const create = await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Pendente', amountCents: 200_00, dueDate: '2026-12-01' },
    });
    // Pay the first one
    await app.inject({
      method: 'POST', url: `/payables/${create.json().id}/pay`,
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: {},
    });

    const paidRes = await app.inject({ method: 'GET', url: '/payables?status=paid', headers: auth(TOKEN_A) });
    expect(paidRes.json().items.length).toBeGreaterThanOrEqual(1);
    for (const p of paidRes.json().items) expect(p.status).toBe('paid');

    const pendingRes = await app.inject({ method: 'GET', url: '/payables?status=pending', headers: auth(TOKEN_A) });
    expect(pendingRes.json().items.length).toBeGreaterThanOrEqual(1);
    for (const p of pendingRes.json().items) expect(p.status).toBe('pending');
  });

  it('filters by type', async () => {
    const { app } = buildTestApp(seed);
    await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Recorrente', amountCents: 100_00, dueDate: '2026-07-01', type: 'recurring', frequency: 'monthly' },
    });
    const res = await app.inject({ method: 'GET', url: '/payables?type=recurring', headers: auth(TOKEN_A) });
    expect(res.json().items.length).toBeGreaterThanOrEqual(1);
    for (const p of res.json().items) expect(p.type).toBe('recurring');
  });

  it('filters by dueWithinDays', async () => {
    const { app } = buildTestApp(seed);
    const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 5);
    await app.inject({
      method: 'POST', url: '/payables',
      headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
      payload: { accountId: ACCOUNT_A1.id, description: 'Próxima', amountCents: 100_00, dueDate: nextWeek.toISOString().slice(0, 10) },
    });
    const res = await app.inject({ method: 'GET', url: '/payables?dueWithinDays=7', headers: auth(TOKEN_A) });
    expect(res.json().items.length).toBeGreaterThanOrEqual(1);
  });

  describe('PATCH /payables/:id', () => {
    it('updates description and amountCents', async () => {
      const { app } = buildTestApp(seed);
      const created = await app.inject({
        method: 'POST', url: '/payables',
        headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
        payload: { accountId: ACCOUNT_A1.id, description: 'Teste', amountCents: 100_00, dueDate: '2026-07-15' },
      });
      const id = created.json().id;
      const res = await app.inject({
        method: 'PATCH', url: `/payables/${id}`,
        headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
        payload: { description: 'Atualizado', amountCents: 200_00 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().description).toBe('Atualizado');
      expect(res.json().amountCents).toBe(200_00);
    });

    it('allows update on paid payable (description, amount, account, category)', async () => {
      const { app } = buildTestApp(seed);
      const created = await app.inject({
        method: 'POST', url: '/payables',
        headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
        payload: { accountId: ACCOUNT_A1.id, description: 'Teste', amountCents: 100_00, dueDate: '2026-07-15' },
      });
      const id = created.json().id;
      await app.inject({ method: 'POST', url: `/payables/${id}/pay`, headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' }, payload: {} });
      const res = await app.inject({
        method: 'PATCH', url: `/payables/${id}`,
        headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
        payload: { description: 'Atualizado apos pagamento', amountCents: 200_00 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().description).toBe('Atualizado apos pagamento');
      expect(res.json().amountCents).toBe(200_00);
    });

    it('rejects update on cancelled payable', async () => {
      const { app } = buildTestApp(seed);
      const created = await app.inject({
        method: 'POST', url: '/payables',
        headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
        payload: { accountId: ACCOUNT_A1.id, description: 'Teste', amountCents: 100_00, dueDate: '2026-07-15' },
      });
      const id = created.json().id;
      await app.inject({ method: 'POST', url: `/payables/${id}/cancel`, headers: auth(TOKEN_A) });
      const res = await app.inject({
        method: 'PATCH', url: `/payables/${id}`,
        headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
        payload: { description: 'Nao deve' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns 404 for non-existent payable', async () => {
      const { app } = buildTestApp(seed);
      const res = await app.inject({
        method: 'PATCH', url: '/payables/00000000-0000-4000-8000-000000000099',
        headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
        payload: { description: 'Nao existe' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('requires auth', async () => {
      const { app } = buildTestApp(seed);
      const res = await app.inject({
        method: 'PATCH', url: '/payables/00000000-0000-4000-8000-000000000099',
        headers: { 'Content-Type': 'application/json' },
        payload: { description: 'Sem token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /payables/:id/unpay', () => {
    it('unpays a paid payable, reverts status to pending or overdue', async () => {
      const { app } = buildTestApp(seed);
      const created = await app.inject({
        method: 'POST', url: '/payables',
        headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
        payload: { accountId: ACCOUNT_A1.id, description: 'Undo Test', amountCents: 100_00, dueDate: '2099-01-01' },
      });
      const id = created.json().id;
      // Pay it
      const payRes = await app.inject({ method: 'POST', url: `/payables/${id}/pay`, headers: auth(TOKEN_A) });
      const _paidRes = await app.inject({ method: 'GET', url: `/payables/${id}`, headers: auth(TOKEN_A) }).catch(() => null);

      // Unpay (V4.1 REVIEWFIX F2: paidTransactionId is required)
      const unpayRes = await app.inject({
        method: 'POST', url: `/payables/${id}/unpay`,
        headers: auth(TOKEN_A),
        payload: { paidTransactionId: payRes.json().paidTransactionId },
      });
      expect(unpayRes.statusCode).toBe(200);
      expect(unpayRes.json().status).toBe('pending');
      expect(unpayRes.json().paidDate).toBeUndefined();
    });

    it('restores due-today payable to pending on unpay', async () => {
      const { app } = buildTestApp(seed);
      const today = new Date().toISOString().slice(0, 10);
      const created = await app.inject({
        method: 'POST', url: '/payables',
        headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
        payload: { accountId: ACCOUNT_A1.id, description: 'Hoje', amountCents: 100_00, dueDate: today },
      });
      const id = created.json().id;
      const payRes = await app.inject({ method: 'POST', url: `/payables/${id}/pay`, headers: auth(TOKEN_A) });

      const unpayRes = await app.inject({
        method: 'POST', url: `/payables/${id}/unpay`,
        headers: auth(TOKEN_A),
        payload: { paidTransactionId: payRes.json().paidTransactionId },
      });
      expect(unpayRes.statusCode).toBe(200);
      expect(unpayRes.json().status).toBe('pending');
    });

    it('returns 404 for non-existent payable', async () => {
      const { app } = buildTestApp(seed);
      const res = await app.inject({
        method: 'POST', url: '/payables/00000000-0000-4000-8000-000000000099/unpay',
        headers: auth(TOKEN_A),
        payload: { paidTransactionId: '00000000-0000-4000-8000-000000000099' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects unpay on non-paid payable', async () => {
      const { app } = buildTestApp(seed);
      const created = await app.inject({
        method: 'POST', url: '/payables',
        headers: { ...auth(TOKEN_A), 'Content-Type': 'application/json' },
        payload: { accountId: ACCOUNT_A1.id, description: 'Nao Paga', amountCents: 100_00, dueDate: '2099-01-01' },
      });
      const id = created.json().id;
      const res = await app.inject({
        method: 'POST', url: `/payables/${id}/unpay`,
        headers: auth(TOKEN_A),
        payload: { paidTransactionId: '00000000-0000-4000-8000-000000000099' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('requires auth', async () => {
      const { app } = buildTestApp(seed);
      const res = await app.inject({
        method: 'POST', url: '/payables/00000000-0000-4000-8000-000000000099/unpay',
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
