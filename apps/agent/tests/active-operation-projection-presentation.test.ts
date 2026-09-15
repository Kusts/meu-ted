import { describe, expect, it } from 'vitest';
import { toActiveOperationRecords } from '../src/mutations/active-operation-projection.js';

const presentation = {
  id: 'op-1',
  status: 'proposed',
  tool: 'transactions.expense.create',
  title: 'Confirmar despesa',
  amountCents: 85000,
  description: 'Mercado',
  date: '2026-09-14',
  expiresAt: '2026-09-14T13:00:00.000Z',
  warnings: [],
};

describe('FIX-P1 RED: projection preserves canonical presentation', () => {
  it('relays a valid presentation and strips authority material', () => {
    const out = toActiveOperationRecords([
      {
        id: 'op-1', status: 'proposed', tool: 'transactions.expense.create',
        createdAt: '2026-09-14T10:00:00.000Z', expiresAt: '2026-09-14T13:00:00.000Z',
        amountCents: 85000, description: 'Mercado',
        presentation,
        attestation: 'a'.repeat(64),
        normalizedArgs: { amountCents: 1 },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.presentation).toMatchObject({ title: 'Confirmar despesa', amountCents: 85000 });
    expect(out[0]!).not.toHaveProperty('attestation');
    expect(out[0]!).not.toHaveProperty('normalizedArgs');
  });

  it('drops a poisoned presentation but keeps the lean record', () => {
    const out = toActiveOperationRecords([
      {
        id: 'op-1', status: 'proposed', tool: 'transactions.expense.create',
        createdAt: '2026-09-14T10:00:00.000Z', expiresAt: '2026-09-14T13:00:00.000Z',
        presentation: { ...presentation, attestation: 'a'.repeat(64) },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!).not.toHaveProperty('presentation');
    expect(out[0]!.id).toBe('op-1');
  });
});
