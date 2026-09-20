/**
 * TASK correct-auth-order-and-static-gates (TDD RED):
 * Auth vence idempotência em mutação financeira — credencial inválida sem
 * Idempotency-Key deve retornar 401 (nunca 400 validation.required);
 * credencial válida sem chave retorna 400.
 */
import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const payload = {
  name: 'Netflix',
  amountCents: 3990,
  cycle: 'monthly',
  day: 15,
  paymentMethod: 'credit_card',
};

describe('auth-order vs idempotency-key (POST /subscriptions)', () => {
  it('invalid device token without key → 401, never 400', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: { 'x-device-token': 'bogus-token', 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()?.code ?? '').not.toBe('validation.required');
  });

  it('invalid bearer without key → 401, never 400', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: { authorization: 'Bearer bogus-token', 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()?.code ?? '').not.toBe('validation.required');
  });

  it('invalid cookie without key → 401, never 400', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: { cookie: 'better-auth.session_token=invalid', 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()?.code ?? '').not.toBe('validation.required');
  });

  it('valid device token without key → 400 validation.required', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.required');
  });

  it('anonymous without key → 401 (auth untouched)', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(401);
  });
});
