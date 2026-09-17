/**
 * V4.1 PHASE 2 (Tasks 2.16–2.17, SPEC §9.10) — billing-month helper boundary tests.
 *
 * RED: `src/shared/billing-month.ts` does not exist yet. The helper must
 * compute installment/billing dates WITHOUT `Date.setUTCMonth()` overflow
 * (2026-01-31 + 1 month → 2026-02-28, not 2026-03-03).
 */

import { describe, expect, it } from 'vitest';
import {
  addMonthsSafe,
  clampDayToMonth,
  installmentDates,
} from '../../src/shared/billing-month.js';

describe('clampDayToMonth', () => {
  it('clamps February in a common year to 28', () => {
    expect(clampDayToMonth(2026, 2, 31)).toBe(28);
    expect(clampDayToMonth(2026, 2, 29)).toBe(28);
    expect(clampDayToMonth(2026, 2, 28)).toBe(28);
  });

  it('keeps February 29 in a leap year', () => {
    expect(clampDayToMonth(2024, 2, 29)).toBe(29);
    expect(clampDayToMonth(2024, 2, 31)).toBe(29);
  });

  it('applies century leap rules (2000 leap, 1900 not leap)', () => {
    expect(clampDayToMonth(2000, 2, 29)).toBe(29);
    expect(clampDayToMonth(1900, 2, 29)).toBe(28);
  });

  it('clamps 30-day months and keeps 31-day months', () => {
    expect(clampDayToMonth(2026, 4, 31)).toBe(30);
    expect(clampDayToMonth(2026, 6, 31)).toBe(30);
    expect(clampDayToMonth(2026, 1, 31)).toBe(31);
    expect(clampDayToMonth(2026, 12, 31)).toBe(31);
  });

  it('never raises the day, only clamps', () => {
    expect(clampDayToMonth(2026, 1, 15)).toBe(15);
    expect(clampDayToMonth(2026, 2, 1)).toBe(1);
  });
});

describe('addMonthsSafe', () => {
  it('clamps Jan 31 + 1 month to Feb 28 (common year)', () => {
    expect(addMonthsSafe('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('clamps Jan 31 + 1 month to Feb 29 (leap year)', () => {
    expect(addMonthsSafe('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('preserves the anchor day when the target month has it', () => {
    expect(addMonthsSafe('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonthsSafe('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('crosses the year boundary Dec → Jan', () => {
    expect(addMonthsSafe('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsSafe('2026-12-31', 2)).toBe('2027-02-28');
  });

  it('handles day 30 anchors against February', () => {
    expect(addMonthsSafe('2026-01-30', 1)).toBe('2026-02-28');
    expect(addMonthsSafe('2024-01-30', 1)).toBe('2024-02-29');
  });

  it('handles Feb 29 anchors across leap boundaries', () => {
    expect(addMonthsSafe('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonthsSafe('2023-02-28', 12)).toBe('2024-02-28');
  });

  it('supports zero and negative offsets', () => {
    expect(addMonthsSafe('2026-05-31', 0)).toBe('2026-05-31');
    expect(addMonthsSafe('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('rejects malformed input', () => {
    expect(() => addMonthsSafe('not-a-date', 1)).toThrow();
    expect(() => addMonthsSafe('2026-13-01', 1)).toThrow();
    expect(() => addMonthsSafe('2026-01-01', 1.5)).toThrow();
  });
});

describe('installmentDates', () => {
  it('spaces parcels one billing month apart without overflow', () => {
    expect(installmentDates('2026-01-31', 3)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('honours leap-year February for the second parcel', () => {
    expect(installmentDates('2024-01-31', 2)).toEqual(['2024-01-31', '2024-02-29']);
  });

  it('crosses year boundaries and multiple years', () => {
    expect(installmentDates('2026-11-30', 4)).toEqual([
      '2026-11-30',
      '2026-12-30',
      '2027-01-30',
      '2027-02-28',
    ]);
  });

  it('keeps every parcel a valid calendar date anchored on the purchase day', () => {
    const dates = installmentDates('2026-01-31', 12);
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe('2026-01-31');
    expect(dates[1]).toBe('2026-02-28');
    expect(dates[11]).toBe('2026-12-31');
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(`${d}T00:00:00.000Z`))).toBe(false);
    }
  });

  it('single parcel returns the purchase date unchanged', () => {
    expect(installmentDates('2026-06-15', 1)).toEqual(['2026-06-15']);
  });

  it('rejects invalid counts', () => {
    expect(() => installmentDates('2026-01-31', 0)).toThrow();
    expect(() => installmentDates('2026-01-31', 49)).toThrow();
    expect(() => installmentDates('2026-01-31', 2.5)).toThrow();
  });
});
