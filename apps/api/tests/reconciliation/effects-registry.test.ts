/**
 * T3.2 — MutationReceipt emission + Mutation Effects Registry wiring
 * (SPEC §15.1, §15.1.1). RED-first: the server-side registry module
 * (src/reconciliation/effects-registry.ts) does not exist yet.
 *
 * Server-side only: affectedTargets are NEVER derived from the LLM or the
 * PWA — they come exclusively from the llm-contracts registry data.
 */
import { describe, it, expect } from 'vitest';
import {
  MUTATION_KINDS,
  MUTATION_EFFECTS_REGISTRY,
  mutationReceiptSchema,
} from '@pi-finance/llm-contracts';
import {
  resolveEffects,
  buildMutationReceipt,
  buildTedReceipt,
  attachMutationReceipt,
} from '../../src/reconciliation/effects-registry.js';

describe('effects-registry completeness (fail fast)', () => {
  it('resolves every MUTATION_KIND to a deterministic non-empty target set', () => {
    for (const kind of MUTATION_KINDS) {
      const targets = resolveEffects(kind);
      expect(Array.isArray(targets)).toBe(true);
      expect(targets.length).toBeGreaterThan(0);
    }
  });

  it('unknown kind throws instead of silently returning an empty refresh', () => {
    expect(() => resolveEffects('nope.does.not.exist')).toThrow(/no registered mutation effects/);
  });
});

describe('buildMutationReceipt', () => {
  it('normal write receipt carries registry-derived targets and NO operationId', () => {
    const receipt = buildMutationReceipt('transaction.create', { type: 'transaction', id: 'tx-1' });
    expect(receipt.mutationKind).toBe('transaction.create');
    expect(receipt.status).toBe('succeeded');
    expect(receipt.affectedTargets).toEqual(
      MUTATION_EFFECTS_REGISTRY['transaction.create'].affectedTargets,
    );
    expect(receipt.operationId).toBeUndefined();
    expect(mutationReceiptSchema.safeParse(receipt).success).toBe(true);
  });

  it('TED approval-tool receipt WITHOUT operationId is invalid (schema-level)', () => {
    // The builder refuses to construct it — the shared schema rejects the
    // origin-less TED receipt at parse time.
    expect(() => buildMutationReceipt('transactions.expense.create')).toThrow(
      /require the origin operationId/,
    );
    // Raw schema level: a hand-built TED receipt without operationId fails.
    expect(
      mutationReceiptSchema.safeParse({
        mutationId: 'm-1',
        mutationKind: 'transactions.expense.create',
        status: 'succeeded',
        affectedTargets: ['transactions'],
      }).success,
    ).toBe(false);
    expect(() => buildTedReceipt('transactions.expense.create', 'op-1')).not.toThrow();
  });

  it('TED receipt carries operationId + registry targets + entity', () => {
    const receipt = buildTedReceipt('transactions.expense.create', 'op-1');
    expect(receipt.operationId).toBe('op-1');
    expect(receipt.affectedTargets).toEqual(
      MUTATION_EFFECTS_REGISTRY['transactions.expense.create'].affectedTargets,
    );
    expect(receipt.entity).toEqual({ type: 'transaction', id: 'op-1' });
    expect(mutationReceiptSchema.safeParse(receipt).success).toBe(true);
  });

  it('mutationId is unique across two mutations', () => {
    const first = buildMutationReceipt('transaction.create');
    const second = buildMutationReceipt('transaction.create');
    expect(first.mutationId).not.toBe(second.mutationId);
  });
});

describe('attachMutationReceipt', () => {
  it('attaches a receipt additively to an object body without operationId', () => {
    const body = attachMutationReceipt({ id: 'tx-1', kind: 'expense' }, 'transaction.create', {
      type: 'transaction',
      id: 'tx-1',
    });
    expect(body.id).toBe('tx-1');
    expect(body.receipt.mutationKind).toBe('transaction.create');
    expect(body.receipt.operationId).toBeUndefined();
    expect(body.receipt.affectedTargets).toEqual(resolveEffects('transaction.create'));
    expect(mutationReceiptSchema.safeParse(body.receipt).success).toBe(true);
  });
});
