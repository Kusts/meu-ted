import { describe, expect, test } from 'vitest';
import { createApp } from './app.js';

const householdId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const secondAccountId = '33333333-3333-4333-8333-333333333333';
const cardId = '44444444-4444-4444-8444-444444444444';

async function buildSeededApp() {
  const app = createApp({
    webhookSecret: 'secret',
    allowedGroupIds: ['5511999999999@g.us'],
    registeredPhones: ['5511999999999'],
  });

  await app.inject({
    method: 'POST',
    url: '/accounts',
    payload: { id: accountId, householdId, name: 'Inter', type: 'checking', scope: 'shared' },
  });
  await app.inject({
    method: 'POST',
    url: '/accounts',
    payload: { id: secondAccountId, householdId, name: 'Nubank', type: 'checking', scope: 'shared' },
  });
  await app.inject({
    method: 'POST',
    url: '/cards',
    payload: { id: cardId, householdId, name: 'Nubank crédito', scope: 'shared', closingDay: 20, dueDay: 27 },
  });

  return app;
}

describe('API Fastify', () => {
  test('GET /health returns ok', async () => {
    const app = createApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  test('POST /accounts creates and GET /accounts lists by household', async () => {
    const app = createApp();

    const created = await app.inject({
      method: 'POST',
      url: '/accounts',
      payload: { householdId, name: 'Carteira', type: 'cash', scope: 'shared', initialBalanceCents: -1000 },
    });
    const listed = await app.inject({ method: 'GET', url: `/accounts?householdId=${householdId}` });

    expect(created.statusCode).toBe(201);
    expect(created.json().data.name).toBe('Carteira');
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data).toHaveLength(1);
  });

  test('POST /accounts returns 400 for invalid input', async () => {
    const app = createApp();

    const response = await app.inject({ method: 'POST', url: '/accounts', payload: { householdId, name: '' } });

    expect(response.statusCode).toBe(400);
    expect(response.json().success).toBe(false);
  });

  test('categories find-or-create reuses normalized category', async () => {
    const app = createApp();

    const first = await app.inject({
      method: 'POST',
      url: '/categories/find-or-create',
      payload: { householdId, name: 'Alimentação > Mercado', kind: 'expense' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/categories/find-or-create',
      payload: { householdId, name: 'Mercado', kind: 'expense' },
    });
    const listed = await app.inject({ method: 'GET', url: `/categories?householdId=${householdId}` });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.created).toBe(false);
    expect(listed.json().data.length).toBeGreaterThanOrEqual(2);
  });

  test('records expense, income and transfer use anti-lie service results', async () => {
    const app = await buildSeededApp();

    const expense = await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'Mercado', date: new Date().toISOString(), source: 'dashboard' },
    });
    const income = await app.inject({
      method: 'POST',
      url: '/records/income',
      payload: { householdId, accountId, amountCents: 10000, description: 'Pix', date: new Date().toISOString(), source: 'dashboard' },
    });
    const transfer = await app.inject({
      method: 'POST',
      url: '/records/transfer',
      payload: { householdId, fromAccountId: accountId, toAccountId: secondAccountId, amountCents: 1000, description: 'Reserva', date: new Date().toISOString(), source: 'dashboard' },
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId: crypto.randomUUID(), amountCents: 5000, description: 'X', date: new Date().toISOString(), source: 'dashboard' },
    });

    expect(expense.statusCode).toBe(201);
    expect(expense.json().success).toBe(true);
    expect(income.statusCode).toBe(201);
    expect(transfer.statusCode).toBe(201);
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().success).toBe(false);
  });

  test('card purchase, installments, close invoice and pay invoice work', async () => {
    const app = await buildSeededApp();

    const purchase = await app.inject({
      method: 'POST',
      url: '/cards/purchase',
      payload: { householdId, cardId, amountCents: 12000, description: 'Academia', purchaseDate: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const installments = await app.inject({
      method: 'POST',
      url: '/cards/installments',
      payload: { householdId, cardId, amountCents: 30000, description: 'Tênis', installmentsCount: 3, firstDate: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const invoiceId = purchase.json().data.record.invoiceId;
    const close = await app.inject({ method: 'POST', url: `/invoices/${invoiceId}/close`, payload: { householdId } });
    const pay = await app.inject({
      method: 'POST',
      url: `/invoices/${invoiceId}/pay`,
      payload: { householdId, paymentAccountId: accountId, amountCents: 12000, paymentDate: '2026-05-27T12:00:00.000Z', source: 'dashboard' },
    });

    expect(purchase.statusCode).toBe(201);
    expect(installments.statusCode).toBe(201);
    expect(installments.json().data.installmentGroup.installmentsCount).toBe(3);
    expect(close.statusCode).toBe(200);
    expect(pay.statusCode).toBe(201);
  });

  test('recurrence endpoints create 12 occurrences and maintain horizon idempotently', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/recurrences',
      payload: { householdId, description: 'Internet', amountCents: 10000, period: 'monthly', targetType: 'account_debit', firstDate: '2026-06-10T12:00:00.000Z', accountId },
    });
    const recurrenceId = created.json().data.recurrence.id;
    const maintained = await app.inject({ method: 'POST', url: `/recurrences/${recurrenceId}/maintain-horizon`, payload: { householdId } });

    expect(created.statusCode).toBe(201);
    expect(created.json().data.occurrences).toHaveLength(12);
    expect(maintained.statusCode).toBe(200);
    expect(maintained.json().data.success).toBe(true);
  });

  test('webhook endpoint validates and forwards Evolution messages', async () => {
    const app = createApp({
      webhookSecret: 'secret',
      allowedGroupIds: ['5511999999999@g.us'],
      registeredPhones: ['5511999999999'],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/evolution',
      payload: {
        secret: 'secret',
        instanceId: 'main',
        timestamp: Date.now(),
        data: {
          key: { remoteJid: '5511999999999@g.us', fromMe: false, id: 'msg-1' },
          message: { conversation: 'gastei 50 mercado no inter' },
          pushName: 'Walis',
        },
      },
    });
    const retry = await app.inject({
      method: 'POST',
      url: '/webhooks/evolution',
      payload: {
        secret: 'secret',
        instanceId: 'main',
        timestamp: Date.now(),
        data: {
          key: { remoteJid: '5511999999999@g.us', fromMe: false, id: 'msg-1' },
          message: { conversation: 'gastei 50 mercado no inter' },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().reason).toBe('mensagem duplicada');
  });
});
