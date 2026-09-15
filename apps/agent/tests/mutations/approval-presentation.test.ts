import { describe, expect, it } from 'vitest';
import { pendingOperationPresentationSchema } from '@pi-finance/llm-contracts';
import { buildApprovalPresentation } from '../../src/mutations/approval-presentation.js';

const args = {
  amountCents: 1234,
  description: 'Mercado',
  date: '2026-09-14',
  accountId: '00000000-0000-4000-8000-0000000000a1',
  categoryId: '00000000-0000-4000-8000-000000000001',
};

describe('buildApprovalPresentation (SPEC §16, H-10, INV-02)', () => {
  it('derives the card from the canonical hash-bound args plus resolved labels', () => {
    const presentation = buildApprovalPresentation({
      operationId: 'pending-v2-1',
      status: 'proposed',
      tool: 'transactions.expense.create',
      normalizedArgs: args,
      expiresAt: '2026-09-14T13:00:00.000Z',
      accountLabel: 'Nubank',
      categoryLabel: 'Alimentação',
    });
    expect(presentation).not.toBeNull();
    // INV-02: the card carries exactly what will execute.
    expect(presentation!.amountCents).toBe(args.amountCents);
    expect(presentation!.description).toBe(args.description);
    expect(presentation!.date).toBe(args.date);
    expect(presentation!.account).toEqual({ id: args.accountId, label: 'Nubank' });
    expect(presentation!.category).toEqual({ id: args.categoryId, label: 'Alimentação' });
    expect(presentation!.title).toBe('Confirmar despesa');
    expect(presentation!.warnings).toEqual([]);
    expect(pendingOperationPresentationSchema.safeParse(presentation).success).toBe(true);
  });

  it('returns null for incomplete args (defense: never propose, never present)', () => {
    expect(
      buildApprovalPresentation({
        operationId: 'op-x',
        status: 'proposed',
        tool: 'transactions.expense.create',
        normalizedArgs: { description: 'Mercado' },
        expiresAt: '2026-09-14T13:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('never emits attestation material in the presentation', () => {
    const presentation = buildApprovalPresentation({
      operationId: 'pending-v2-1',
      status: 'proposed',
      tool: 'transactions.expense.create',
      normalizedArgs: args,
      expiresAt: '2026-09-14T13:00:00.000Z',
      accountLabel: 'Nubank',
      categoryLabel: 'Alimentação',
    });
    expect(JSON.stringify(presentation)).not.toContain('attestation');
    expect(pendingOperationPresentationSchema.safeParse({ ...presentation, attestation: 'smuggled' }).success).toBe(false);
  });
});
