import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const auth = () => ({ 'x-device-token': TOKEN_A, 'content-type': 'application/json' });

describe('ledger idempotent retry and conflict handling', () => {
  it('replays the canonical response on retry with the same key and payload', async () => {
    const { app } = buildTestApp();
    const payload = { name: 'Retry A', kind: 'bank', initialBalanceCents: 5_000 };
    const first = await app.inject({ method: 'POST', url: '/accounts', headers: { ...auth(), 'idempotency-key': 'acct-retry-1' }, payload });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({ method: 'POST', url: '/accounts', headers: { ...auth(), 'idempotency-key': 'acct-retry-1' }, payload });
    expect(second.statusCode).toBe(201);
    expect(second.json().id).toBe(first.json().id);

    const listed = await app.inject({ method: 'GET', url: '/accounts', headers: auth() });
    expect(listed.json().items.filter((item: { name: string }) => item.name === 'Retry A')).toHaveLength(1);
  });

  it('conflicts with 409 when the same key is reused with a different payload', async () => {
    const { app } = buildTestApp();
    const first = await app.inject({ method: 'POST', url: '/accounts', headers: { ...auth(), 'idempotency-key': 'acct-conflict-1' }, payload: { name: 'Conflict A', kind: 'bank', initialBalanceCents: 5_000 } });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({ method: 'POST', url: '/accounts', headers: { ...auth(), 'idempotency-key': 'acct-conflict-1' }, payload: { name: 'Conflict B', kind: 'bank', initialBalanceCents: 9_000 } });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('idempotency.conflict');
  });

  it('returns 409 duplicate for the same account name', async () => {
    const { app } = buildTestApp();
    const first = await app.inject({ method: 'POST', url: '/accounts', headers: auth(), payload: { name: 'Dup A', kind: 'bank', initialBalanceCents: 5_000 } });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/accounts', headers: auth(), payload: { name: 'dup a', kind: 'bank', initialBalanceCents: 5_000 } });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('in_use');
  });

  it('validates domain payloads with 400/422 issues', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'POST', url: '/accounts', headers: auth(), payload: { name: '', kind: 'bank' } });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation.error');
  });

  it('requires authentication for ledger mutations', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'POST', url: '/accounts', payload: { name: 'A', kind: 'bank', initialBalanceCents: 5_000 } });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an empty idempotency-key header with validation error', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'POST', url: '/accounts', headers: { ...auth(), 'idempotency-key': '   ' }, payload: { name: 'Key A', kind: 'bank', initialBalanceCents: 5_000 } });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation.invalid');
  });
});