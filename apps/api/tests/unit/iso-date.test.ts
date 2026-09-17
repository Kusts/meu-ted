import { describe, expect, it } from 'vitest';
import { isoDateSchema, isoDateTimeSchema, isValidIsoDate } from '../../src/shared/iso-date.js';
import { createExpenseInputSchema } from '../../src/writes/types.js';

describe('shared ISO date schema (V4.1 Phase 8, task 8.8)', () => {
  it.each(['2026-02-30', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-10', '2023-02-29', '1900-02-29'])(
    'rejects impossible calendar date %s',
    (date) => {
      expect(isValidIsoDate(date)).toBe(false);
      expect(isoDateSchema.safeParse(date).success).toBe(false);
    },
  );

  it.each(['2026-02-28', '2024-02-29', '2000-02-29', '2026-12-31', '2026-01-01'])(
    'accepts real calendar date %s (incl. leap days)',
    (date) => {
      expect(isValidIsoDate(date)).toBe(true);
      expect(isoDateSchema.safeParse(date).success).toBe(true);
    },
  );

  it('keeps the strict YYYY-MM-DD shape (no datetimes, no padding shortcuts)', () => {
    for (const bad of ['2026-9-5', '2026/09/05', '05-09-2026', '2026-09-05T00:00:00Z', '', 'not-a-date']) {
      expect(isoDateSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('validates ISO datetimes separately', () => {
    expect(isoDateTimeSchema.safeParse('2026-09-05T10:00:00Z').success).toBe(true);
    expect(isoDateTimeSchema.safeParse('2026-09-05').success).toBe(false);
    expect(isoDateTimeSchema.safeParse('not-a-date').success).toBe(false);
  });

  it('write boundaries reject impossible dates', () => {
    const base = {
      description: 'Mercado',
      amountCents: 1000,
      accountId: '11111111-1111-4111-8111-111111111111',
      categoryId: '22222222-2222-4222-8222-222222222222',
    };
    expect(createExpenseInputSchema.safeParse({ ...base, date: '2026-02-30' }).success).toBe(false);
    expect(createExpenseInputSchema.safeParse({ ...base, date: '2024-02-29' }).success).toBe(true);
  });
});
