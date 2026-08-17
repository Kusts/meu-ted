/**
 * Phase 1.1 — Test date helpers. Generate dates relative to "now"
 * so tests don't break when the month changes.
 *
 * Each helper accepts an optional `now: Date` so tests can pin a deterministic
 * clock instead of reading the real system time.
 */

/** YYYY-MM-DD for the nth day of the current UTC month. */
export const thisMonth = (day: number, now: Date = new Date()): string => {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** YYYY-MM-DD for the nth day of last UTC month. */
export const lastMonth = (day: number, now: Date = new Date()): string => {
  const ref = new Date(now);
  ref.setUTCDate(1);
  ref.setUTCMonth(ref.getUTCMonth() - 1);
  const y = ref.getUTCFullYear();
  const m = String(ref.getUTCMonth() + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** YYYY-MM-DD for today. */
export const today = (now: Date = new Date()): string => {
  return now.toISOString().slice(0, 10);
};

/** YYYY-MM-DD for the nth day of next UTC month. */
export const nextMonth = (day: number, now: Date = new Date()): string => {
  const ref = new Date(now);
  ref.setUTCDate(1);
  ref.setUTCMonth(ref.getUTCMonth() + 1);
  const y = ref.getUTCFullYear();
  const m = String(ref.getUTCMonth() + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const daysAgo = (n: number, now: Date = new Date()): string => {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
