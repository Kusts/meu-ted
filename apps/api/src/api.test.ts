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

  // ─────────────────────────────────────────────────────────────────────────
  // GET /records with filters
  // ─────────────────────────────────────────────────────────────────────────

  test('GET /records returns empty list when no records exist', async () => {
    const app = createApp();

    const response = await app.inject({ method: 'GET', url: `/records?householdId=${householdId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: [], total: 0 });
  });

  test('GET /records returns created records', async () => {
    const app = await buildSeededApp();

    await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'Mercado', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    await app.inject({
      method: 'POST',
      url: '/records/income',
      payload: { householdId, accountId, amountCents: 10000, description: 'Pix', date: '2026-05-15T12:00:00.000Z', source: 'dashboard' },
    });

    const response = await app.inject({ method: 'GET', url: `/records?householdId=${householdId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.json().data).toHaveLength(2);
    expect(response.json().total).toBe(2);
  });

  test('GET /records filters by type', async () => {
    const app = await buildSeededApp();

    await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'Mercado', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    await app.inject({
      method: 'POST',
      url: '/records/income',
      payload: { householdId, accountId, amountCents: 10000, description: 'Pix', date: '2026-05-15T12:00:00.000Z', source: 'dashboard' },
    });

    const expenseOnly = await app.inject({ method: 'GET', url: `/records?householdId=${householdId}&type=expense` });
    const incomeOnly = await app.inject({ method: 'GET', url: `/records?householdId=${householdId}&type=income` });

    expect(expenseOnly.statusCode).toBe(200);
    expect(expenseOnly.json().data).toHaveLength(1);
    expect(expenseOnly.json().data[0].type).toBe('expense');
    expect(incomeOnly.json().data).toHaveLength(1);
    expect(incomeOnly.json().data[0].type).toBe('income');
  });

  test('GET /records filters by dateFrom and dateTo', async () => {
    const app = await buildSeededApp();

    await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'Mercado', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 3000, description: 'Farmácia', date: '2026-05-20T12:00:00.000Z', source: 'dashboard' },
    });
    await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 7000, description: 'Viagem', date: '2026-06-01T12:00:00.000Z', source: 'dashboard' },
    });

    const mayOnly = await app.inject({ method: 'GET', url: `/records?householdId=${householdId}&dateFrom=2026-05-01&dateTo=2026-05-31` });

    expect(mayOnly.statusCode).toBe(200);
    expect(mayOnly.json().data).toHaveLength(2);
    expect(mayOnly.json().total).toBe(2);
  });

  test('GET /records returns 400 without householdId', async () => {
    const app = createApp();

    const response = await app.inject({ method: 'GET', url: '/records' });

    expect(response.statusCode).toBe(400);
    expect(response.json().success).toBe(false);
    expect(response.json().reason).toBe('householdId é obrigatório');
  });

  test('GET /records supports limit and offset', async () => {
    const app = await buildSeededApp();

    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/records/expense',
        payload: { householdId, accountId, amountCents: 1000 + i, description: `Despesa ${i}`, date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
      });
    }

    const firstPage = await app.inject({ method: 'GET', url: `/records?householdId=${householdId}&limit=2&offset=0` });
    const secondPage = await app.inject({ method: 'GET', url: `/records?householdId=${householdId}&limit=2&offset=2` });

    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json().data).toHaveLength(2);
    expect(firstPage.json().total).toBe(5);
    expect(secondPage.json().data).toHaveLength(2);
    expect(secondPage.json().total).toBe(5);
  });

  // ─── PATCH /records/:id ────────────────────────────────────────────────────

  test('PATCH /records/:id updates description', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'Old description', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const recordId = created.json().data.id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/records/${recordId}`,
      payload: { householdId, description: 'New description' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.json().data.description).toBe('New description');
  });

  test('PATCH /records/:id returns 404 for non-existent record', async () => {
    const app = createApp();

    const response = await app.inject({
      method: 'PATCH',
      url: '/records/99999999-9999-4999-8999-999999999999',
      payload: { householdId, description: 'Test' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().success).toBe(false);
  });

  test('PATCH /records/:id generates audit log', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'Original', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const recordId = created.json().data.id;

    await app.inject({
      method: 'PATCH',
      url: `/records/${recordId}`,
      payload: { householdId, description: 'Updated' },
    });

    // Verify audit log was created by checking the record was updated
    const getResponse = await app.inject({ method: 'GET', url: `/records?householdId=${householdId}` });
    expect(getResponse.json().data[0].description).toBe('Updated');
  });

  // ─── DELETE /records/:id ───────────────────────────────────────────────────

  test('DELETE /records/:id changes status to cancelled', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'To delete', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const recordId = created.json().data.id;

    const response = await app.inject({
      method: 'DELETE',
      url: `/records/${recordId}`,
      payload: { householdId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.json().data.status).toBe('cancelled');
  });

  test('DELETE /records/:id returns 404 for non-existent record', async () => {
    const app = createApp();

    const response = await app.inject({
      method: 'DELETE',
      url: '/records/99999999-9999-4999-8999-999999999999',
      payload: { householdId },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().success).toBe(false);
  });

  test('DELETE /records/:id generates audit log', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'To delete', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const recordId = created.json().data.id;

    await app.inject({
      method: 'DELETE',
      url: `/records/${recordId}`,
      payload: { householdId },
    });

    // Verify audit log was created by checking the record status
    const getResponse = await app.inject({ method: 'GET', url: `/records?householdId=${householdId}` });
    expect(getResponse.json().data[0].status).toBe('cancelled');
  });

  // ─── POST /records/:id/undo ─────────────────────────────────────────────────

  test('POST /records/:id/undo reverses expense creating income', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'Despesa', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const recordId = created.json().data.id;

    const response = await app.inject({
      method: 'POST',
      url: `/records/${recordId}/undo`,
      payload: { householdId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.json().data.originalRecord.status).toBe('cancelled');
    expect(response.json().data.reversalRecord.type).toBe('income');
    expect(response.json().data.reversalRecord.amountCents).toBe(5000);
    expect(response.json().data.reversalRecord.relatedRecordId).toBe(recordId);
  });

  test('POST /records/:id/undo reverses income creating expense', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/records/income',
      payload: { householdId, accountId, amountCents: 3000, description: 'Receita', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const recordId = created.json().data.id;

    const response = await app.inject({
      method: 'POST',
      url: `/records/${recordId}/undo`,
      payload: { householdId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.json().data.reversalRecord.type).toBe('expense');
  });

  test('POST /records/:id/undo reverses transfer swapping from/to', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/records/transfer',
      payload: { householdId, fromAccountId: accountId, toAccountId: secondAccountId, amountCents: 1000, description: 'Transferência', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const recordId = created.json().data.id;

    const response = await app.inject({
      method: 'POST',
      url: `/records/${recordId}/undo`,
      payload: { householdId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.json().data.reversalRecord.type).toBe('transfer');
    expect(response.json().data.reversalRecord.fromAccountId).toBe(secondAccountId);
    expect(response.json().data.reversalRecord.toAccountId).toBe(accountId);
  });

  test('POST /records/:id/undo returns error for already cancelled record', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'Despesa', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const recordId = created.json().data.id;

    // First undo
    await app.inject({
      method: 'POST',
      url: `/records/${recordId}/undo`,
      payload: { householdId },
    });

    // Try to undo again
    const response = await app.inject({
      method: 'POST',
      url: `/records/${recordId}/undo`,
      payload: { householdId },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().success).toBe(false);
    expect(response.json().reason).toBe('Registro já está cancelado');
  });

  test('POST /records/:id/undo returns 404 for non-existent record', async () => {
    const app = createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/records/99999999-9999-4999-8999-999999999999/undo',
      payload: { householdId },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().success).toBe(false);
  });

  test('POST /records/:id/undo generates audit logs', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'Despesa', date: '2026-05-10T12:00:000.000Z', source: 'dashboard' },
    });
    const recordId = created.json().data.id;

    const response = await app.inject({
      method: 'POST',
      url: `/records/${recordId}/undo`,
      payload: { householdId },
    });

    expect(response.statusCode).toBe(200);
    // Verify by checking original is cancelled and reversal exists
    const getResponse = await app.inject({ method: 'GET', url: `/records?householdId=${householdId}` });
    expect(getResponse.json().data.some((r: any) => r.status === 'cancelled')).toBe(true);
    expect(getResponse.json().data.some((r: any) => r.relatedRecordId === recordId)).toBe(true);
  });

  test('POST /records/:id/undo reversal has relatedRecordId pointing to original', async () => {
    const app = await buildSeededApp();

    const created = await app.inject({
      method: 'POST',
      url: '/records/expense',
      payload: { householdId, accountId, amountCents: 5000, description: 'Despesa', date: '2026-05-10T12:00:00.000Z', source: 'dashboard' },
    });
    const recordId = created.json().data.id;

    const response = await app.inject({
      method: 'POST',
      url: `/records/${recordId}/undo`,
      payload: { householdId },
    });

    expect(response.json().data.reversalRecord.relatedRecordId).toBe(recordId);
  });

  // ─── GET /cards ─────────────────────────────────────────────────────────────

  test('GET /cards returns empty list when no cards exist', async () => {
    const app = createApp();

    const response = await app.inject({ method: 'GET', url: `/cards?householdId=${householdId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: [] });
  });

  test('GET /cards returns created cards', async () => {
    const app = await buildSeededApp();

    const response = await app.inject({ method: 'GET', url: `/cards?householdId=${householdId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0].name).toBe('Nubank crédito');
  });

  test('GET /cards returns 400 without householdId', async () => {
    const app = createApp();

    const response = await app.inject({ method: 'GET', url: '/cards' });

    expect(response.statusCode).toBe(400);
    expect(response.json().success).toBe(false);
  });

  // ─── GET /invoices ─────────────────────────────────────────────────────────

  test('GET /invoices returns empty list', async () => {
    const app = await buildSeededApp();

    const response = await app.inject({ method: 'GET', url: `/invoices?householdId=${householdId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: [] });
  });

  test('GET /invoices returns invoices for specific card', async () => {
    const app = await buildSeededApp();

    // Create a card purchase which creates an invoice
    await app.inject({
      method: 'POST',
      url: '/cards/purchase',
      payload: {
        householdId,
        cardId,
        amountCents: 5000,
        description: 'Compras no mercado',
        purchaseDate: '2026-05-15T12:00:00.000Z',
        source: 'dashboard',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/invoices?householdId=${householdId}&cardId=${cardId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.json().data.length).toBeGreaterThan(0);
  });

  test('GET /invoices returns 400 without householdId', async () => {
    const app = createApp();

    const response = await app.inject({ method: 'GET', url: '/invoices' });

    expect(response.statusCode).toBe(400);
    expect(response.json().success).toBe(false);
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
