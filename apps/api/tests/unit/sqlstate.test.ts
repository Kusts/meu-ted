import { describe, expect, it } from 'vitest';
import { mapPgError } from '../../src/db/sqlstate.js';

const pgError = (code: string) => ({ code, message: `db failed with ${code}` });

describe('central SQLSTATE mapping (V4.1 Phase 8, task 8.10)', () => {
  it('23505 unique violation → 409 conflict', () => {
    expect(mapPgError(pgError('23505'))).toMatchObject({ statusCode: 409, code: 'conflict' });
  });

  it('23503 foreign-key violation → 404 not_found (missing reference)', () => {
    expect(mapPgError(pgError('23503'))).toMatchObject({ statusCode: 404, code: 'not_found' });
  });

  it('23514 check violation → 400 validation', () => {
    const mapped = mapPgError(pgError('23514'));
    expect(mapped).toMatchObject({ statusCode: 400 });
    expect(mapped!.code.startsWith('validation')).toBe(true);
  });

  it.each(['22007', '22P02'])('%s invalid input → 400 validation', (code) => {
    const mapped = mapPgError(pgError(code));
    expect(mapped).toMatchObject({ statusCode: 400 });
    expect(mapped!.code.startsWith('validation')).toBe(true);
  });

  it('40001 serialization failure → 409 retryable conflict', () => {
    const mapped = mapPgError(pgError('40001'));
    expect(mapped).toMatchObject({ statusCode: 409, code: 'conflict' });
    expect(mapped!.message).toMatch(/concorrência|retry|tente novamente/i);
  });

  it('40P01 deadlock → 409 conflict', () => {
    const mapped = mapPgError(pgError('40P01'));
    expect(mapped).toMatchObject({ statusCode: 409, code: 'conflict' });
    expect(mapped!.message).toMatch(/deadlock|concorrência/i);
  });

  it('57014 statement timeout → 503 (never raw SQL, never 500)', () => {
    const mapped = mapPgError(pgError('57014'));
    expect(mapped).toMatchObject({ statusCode: 503 });
    expect(JSON.stringify(mapped)).not.toContain('57014');
  });

  it('returns null for non-pg errors (DomainError/statusCode paths untouched)', () => {
    expect(mapPgError(new Error('boom'))).toBeNull();
    expect(mapPgError(null)).toBeNull();
    expect(mapPgError({ code: 23505 })).toBeNull();
    expect(mapPgError({ code: '99999', message: 'unknown' })).toBeNull();
  });

  it('mapped shapes never leak internals', () => {
    for (const code of ['23505', '23503', '23514', '22007', '22P02', '40001', '40P01', '57014']) {
      const mapped = mapPgError(pgError(code));
      expect(mapped).toBeTruthy();
      expect(JSON.stringify(mapped)).not.toMatch(/pg_|SQLSTATE|constraint|violates/i);
    }
  });
});
