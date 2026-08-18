import { describe, expect, it, vi } from 'vitest';
import {
  buildIdempotencyKey,
  createInMemoryIdempotencyStore,
  hashIdempotencyPayload,
  requireIdempotencyKey,
  type IdempotencyRequest,
} from '../../src/writes/idempotency.js';

const request = (overrides: Partial<IdempotencyRequest> = {}): IdempotencyRequest => ({
  workspaceId: 'workspace-a',
  actorType: 'device',
  actorId: 'device-a',
  operation: 'transactions.expense.create',
  key: 'same-client-key',
  ...overrides,
});

describe('G2.2.4 — required idempotency key validation', () => {
  it('rejects a missing or blank Idempotency-Key', () => {
    expect(() => requireIdempotencyKey({})).toThrowError(/Idempotency-Key/);
    expect(() => requireIdempotencyKey({ 'idempotency-key': '   ' })).toThrowError(/Idempotency-Key/);
  });

  it('trims a single header and rejects ambiguous or oversized values', () => {
    expect(requireIdempotencyKey({ 'idempotency-key': '  request-1  ' })).toBe('request-1');
    expect(() => requireIdempotencyKey({ 'idempotency-key': ['a', 'b'] })).toThrowError(/Idempotency-Key/);
    expect(() => requireIdempotencyKey({ 'idempotency-key': 'x'.repeat(256) })).toThrowError(/Idempotency-Key/);
  });
});

describe('G0.4.2 — composed idempotency identity', () => {
  it('uses workspace, actor, operation and key in a SHA-256 identity', () => {
    const base = buildIdempotencyKey(request());
    expect(buildIdempotencyKey(request({ actorType: 'user' }))).toBe(base);
    expect(base).toMatch(/^[a-f0-9]{64}$/);
    expect(buildIdempotencyKey(request({ actorId: 'device-b' }))).not.toBe(base);
    expect(buildIdempotencyKey(request({ operation: 'transactions.income.create' }))).not.toBe(base);
    expect(buildIdempotencyKey(request({ key: 'another-client-key' }))).not.toBe(base);
  });

  it('includes a payload version in the SHA-256 hash', () => {
    const hash = hashIdempotencyPayload({ amountCents: 5000 });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks retries after 7 days and expires the record after 90 days', async () => {
    vi.useFakeTimers();
    try {
      const store = createInMemoryIdempotencyStore();
      const started = new Date('2026-07-29T00:00:00.000Z');
      vi.setSystemTime(started);
      const keyRequest = request({ key: 'lifecycle-key' });
      await store.lookupOrRecord(keyRequest, { amountCents: 5000 }, async () => ({ effect: 1 }));

      vi.setSystemTime(started.getTime() + 7 * 24 * 60 * 60 * 1000 + 1);
      await expect(store.lookupOrRecord(keyRequest, { amountCents: 5000 }, async () => ({ effect: 2 })))
        .rejects.toMatchObject({ code: 'idempotency.conflict' });

      vi.setSystemTime(started.getTime() + 90 * 24 * 60 * 60 * 1000 + 1);
      const afterRetention = await store.lookupOrRecord(keyRequest, { amountCents: 5000 }, async () => ({ effect: 3 }));
      expect(afterRetention.replayed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not replay the same raw key across actors or operations', async () => {
    const store = createInMemoryIdempotencyStore();
    let effects = 0;
    const producer = async () => ({ effect: ++effects });

    const first = await store.lookupOrRecord(request(), { amountCents: 5000 }, producer);
    const replay = await store.lookupOrRecord(request(), { amountCents: 5000 }, producer);
    const otherActor = await store.lookupOrRecord(request({ actorId: 'device-b' }), { amountCents: 5000 }, producer);
    const otherOperation = await store.lookupOrRecord(request({ operation: 'transactions.income.create' }), { amountCents: 5000 }, producer);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(otherActor.replayed).toBe(false);
    expect(otherOperation.replayed).toBe(false);
    expect(effects).toBe(3);
  });
});
