import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import { createApprovalPolicy } from '../../src/approvals/policy.js';
import { ACCOUNT_A1, CARD_A1, CATEGORY_FOOD_A, HOUSEHOLD_A } from '../fixtures/seed.js';

const approvalApp = () => buildTestApp({
  accounts: [ACCOUNT_A1, CARD_A1],
  categories: [CATEGORY_FOOD_A],
}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, createApprovalPolicy());

const headers = () => ({
  'x-device-token': TOKEN_A,
  'content-type': 'application/json',
  'idempotency-key': crypto.randomUUID(),
});

const accountPayload = { name: 'Conta', kind: 'bank', initialBalanceCents: 1_000 };

it('holds a high-value card purchase before the card store side effect', async () => {
  const { app, state } = approvalApp();
  const response = await app.inject({ method: 'POST', url: '/cards/purchases', headers: headers(), payload: {
    accountId: CARD_A1.id, description: 'Notebook', amountCents: 50_000, date: '2026-06-10', categoryId: CATEGORY_FOOD_A.id,
  } });

  expect(response.statusCode).toBe(202);
  expect(response.json().status).toBe('pending_approval');
  expect(state.transactions).toHaveLength(0);
});

it('holds a high-value subscription before the subscription store side effect', async () => {
  const { app } = approvalApp();
  const response = await app.inject({ method: 'POST', url: '/subscriptions', headers: headers(), payload: {
    name: 'Plano', amountCents: 50_000, cycle: 'monthly', day: 10, paymentMethod: 'pix',
  } });

  expect(response.statusCode).toBe(202);
  expect(response.json().status).toBe('pending_approval');
});

it('holds a high-value payable update before changing the payable', async () => {
  const { app } = approvalApp();
  const created = await app.inject({ method: 'POST', url: '/payables', headers: headers(), payload: {
    accountId: ACCOUNT_A1.id, description: 'Internet', amountCents: 100, dueDate: '2026-06-10',
  } });

  const response = await app.inject({ method: 'PATCH', url: `/payables/${created.json().id}`, headers: headers(), payload: { amountCents: 50_000 } });

  expect(response.statusCode).toBe(202);
  expect(response.json().status).toBe('pending_approval');
});

it('holds high-value budget and goal creation before persistence', async () => {
  const { app } = approvalApp();
  const budget = await app.inject({ method: 'POST', url: '/budgets', headers: headers(), payload: {
    categoryId: CATEGORY_FOOD_A.id, name: 'Mercado', amountCents: 50_000, period: 'monthly', startDate: '2026-06-01',
  } });
  const goal = await app.inject({ method: 'POST', url: '/goals', headers: headers(), payload: {
    name: 'Reserva', goalType: 'savings', targetAmountCents: 50_000, startDate: '2026-06-01',
  } });

  expect(budget.statusCode).toBe(202);
  expect(goal.statusCode).toBe(202);
});

it('holds destructive account and category deactivation before persistence', async () => {
  const { app } = approvalApp();
  const account = await app.inject({ method: 'POST', url: '/accounts', headers: headers(), payload: accountPayload });
  const category = await app.inject({ method: 'POST', url: '/categories', headers: headers(), payload: { name: 'Outra', kind: 'expense' } });

  const deactivateAccount = await app.inject({ method: 'POST', url: `/accounts/${account.json().id}/deactivate`, headers: headers(), payload: {} });
  const deactivateCategory = await app.inject({ method: 'POST', url: `/categories/${category.json().id}/deactivate`, headers: headers(), payload: {} });

  expect(deactivateAccount.statusCode).toBe(202);
  expect(deactivateCategory.statusCode).toBe(202);
  expect(account.json().status).toBe('active');
  expect(category.json().status).toBe('active');
});
