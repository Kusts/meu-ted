import { describe, expect, it } from 'vitest';
import { formatCents, sumCents } from '../../src/evidence/financial-formatters.js';
import { validateGroundedClaims } from '../../src/evidence/grounding-validator.js';
import { renderBalance, renderUnavailable } from '../../src/responses/deterministic-responses.js';

describe('T2.3 grounded responses', () => {
  it('calculates and formats monetary values in code', () => {
    expect(sumCents([100, 250, -50])).toBe(300);
    expect(formatCents(12345)).toContain('123,45');
    expect(renderBalance({ accountName: 'Conta principal', balanceCents: 12345 })).toContain('R$');
  });

  it('rejects a claim not present in evidence and accepts values from current/snapshot evidence', () => {
    const evidence = { version: '1' as const, items: [{ ref: 'b', source: 'api.balance', retrievedAt: '2026-09-13T12:00:00Z', status: 'ok' as const, data: { balanceCents: 12345, accountName: 'Conta principal' } }] };
    expect(validateGroundedClaims('Seu saldo é R$ 999,99 na Conta principal.', evidence).valid).toBe(false);
    expect(validateGroundedClaims('Seu saldo é R$ 123,45 na Conta principal.', evidence).valid).toBe(true);
  });

  it('fails closed with a safe unavailable response', () => {
    expect(renderUnavailable('saldo')).toBe('Não foi possível consultar saldo agora. Tente novamente mais tarde.');
    expect(renderUnavailable('saldo')).not.toContain('timeout');
  });
});
