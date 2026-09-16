import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const deviceTokenSrc = readFileSync(
  new URL('../../src/auth/device-token.ts', import.meta.url),
  'utf8',
);
const payablesSrc = readFileSync(
  new URL('../../src/payables/postgres.ts', import.meta.url),
  'utf8',
);

describe('T2.4 RED — adversarial scope contract (SPEC §9 C5)', () => {
  it('device-token.ts contains no tautological household scope', () => {
    expect(deviceTokenSrc).not.toMatch(/household_id\s*=\s*household_id/);
  });

  it('payables/postgres.ts contains no tautological household scope', () => {
    expect(payablesSrc).not.toMatch(/household_id\s*=\s*household_id/);
  });

  it('scoped device-token queries bind household_id as an explicit parameter', () => {
    expect(deviceTokenSrc).toMatch(/household_id\s*=\s*\$\d/);
  });
});
