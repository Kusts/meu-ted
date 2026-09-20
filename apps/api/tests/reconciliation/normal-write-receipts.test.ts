/**
 * T3.2 — normal-write MutationReceipts (SPEC §15.1): canonical PWA writes
 * return a receipt with an API-generated mutationId and registry-derived
 * affectedTargets, and NEVER an operationId.
 *
 * RED-first: write routes currently return bare entities.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import {
  MUTATION_EFFECTS_REGISTRY,
  mutationReceiptSchema,
} from '@pi-finance/llm-contracts';

const isoDate = '2026-06-10';

type Setup = {
  app: ReturnType<typeof buildTestApp>['app'];
  accountId: string;
  categoryId: string;
};

const setupAccountAndCategory = async (): Promise<Setup> => {
  const { app } = buildTestApp();
  const acc = await app.inject({
    method: 'POST',
    url: '/accounts',
    headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    payload: { name: 'A', kind: 'bank', initialBalanceCents: 50_000 },
  });
  const cat = await app.inject({
    method: 'POST',
    url: '/categories',
    headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    payload: { name: 'Food', kind: 'expense' },
  });
  return { app, accountId: acc.json().id, categoryId: cat.json().id };
};

describe('normal-write receipts', () => {
  let s: Setup;
  beforeEach(async () => {
    s = await setupAccountAndCategory();
  });

  it('POST /transactions/expense returns a receipt without operationId', async () => {
    const res = await s.app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      payload: {
        description: 'Lunch',
        amountCents: 1500,
        date: isoDate,
        accountId: s.accountId,
        categoryId: s.categoryId,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.kind).toBe('expense');
    expect(body.receipt).toBeTruthy();
    expect(body.receipt.mutationKind).toBe('transaction.create');
    expect(body.receipt.status).toBe('succeeded');
    expect(body.receipt.operationId).toBeUndefined();
    expect(body.receipt.affectedTargets).toEqual(
      MUTATION_EFFECTS_REGISTRY['transaction.create'].affectedTargets,
    );
    expect(mutationReceiptSchema.safeParse(body.receipt).success).toBe(true);
  });

  it('POST /transfers returns a transfer.create receipt; two writes differ', async () => {
    const secondAcc = await s.app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'B', kind: 'bank', initialBalanceCents: 10_000 },
    });
    const make = () =>
      s.app.inject({
        method: 'POST',
        url: '/transfers',
        headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        payload: {
          description: 'hop',
          amountCents: 100,
          date: isoDate,
          fromAccountId: s.accountId,
          toAccountId: secondAcc.json().id,
        },
      });
    const first = await make();
    const second = await make();
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().receipt.mutationKind).toBe('transfer.create');
    expect(first.json().receipt.operationId).toBeUndefined();
    expect(first.json().receipt.affectedTargets).toEqual(
      MUTATION_EFFECTS_REGISTRY['transfer.create'].affectedTargets,
    );
    expect(first.json().receipt.mutationId).not.toBe(second.json().receipt.mutationId);
  });

  it('DELETE /transactions/:id returns 200 with a transaction.delete receipt', async () => {
    const created = await s.app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      payload: {
        description: 'bye',
        amountCents: 100,
        date: isoDate,
        accountId: s.accountId,
        categoryId: s.categoryId,
      },
    });
    const del = await s.app.inject({
      method: 'DELETE',
      url: `/transactions/${created.json().id}`,
      headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() },
    });
    expect(del.statusCode).toBe(200);
    const body = del.json();
    expect(body.receipt).toBeTruthy();
    expect(body.receipt.mutationKind).toBe('transaction.delete');
    expect(body.receipt.status).toBe('succeeded');
    expect(body.receipt.operationId).toBeUndefined();
    expect(body.receipt.affectedTargets).toEqual(
      MUTATION_EFFECTS_REGISTRY['transaction.delete'].affectedTargets,
    );
    expect(mutationReceiptSchema.safeParse(body.receipt).success).toBe(true);
  });
});
