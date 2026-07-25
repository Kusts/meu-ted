/**
 * Idempotency store. Simple, no overengineering.
 *
 * Keyed by (householdId, key). Records the first response and replays
 * it on subsequent calls with the same key, regardless of payload.
 * If the same key is replayed with a *different* payload, throws
 * idempotency.conflict (HTTP 409) — this is the conservative
 * behavior and is what most financial APIs do.
 *
 * TTL: 24h. Expired entries are evicted lazily on access.
 */

import { domainErrors } from './errors.js';

const TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotencyEntry<T> = {
  payloadHash: string;
  response: T;
  createdAt: number;
};

export type IdempotencyStore = {
  /** Throws idempotency.conflict if same key+different payload. Returns cached response if any. */
  lookupOrRecord<T>(
    householdId: string,
    key: string,
    payload: unknown,
    producer: () => Promise<T>,
  ): Promise<{ response: T; replayed: boolean }>;
  clear(): void;
};

const hash = (payload: unknown): string => {
  // Stable, fast, non-cryptographic. Sufficient for "same payload?" check.
  const json = JSON.stringify(payload, Object.keys(payload as object).sort());
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = (h * 31 + json.charCodeAt(i)) | 0;
  }
  return String(h);
};

export const createInMemoryIdempotencyStore = (): IdempotencyStore => {
  const store = new Map<string, IdempotencyEntry<unknown>>();

  const evictExpired = (now: number): void => {
    for (const [k, v] of store.entries()) {
      if (now - v.createdAt > TTL_MS) store.delete(k);
    }
  };

  return {
    async lookupOrRecord(householdId, key, payload, producer) {
      const composite = `${householdId}::${key}`;
      const now = Date.now();
      evictExpired(now);
      const existing = store.get(composite);
      if (existing) {
        if (existing.payloadHash !== hash(payload)) {
          throw domainErrors.idempotencyConflict();
        }
        return { response: existing.response as never, replayed: true };
      }
      const response = await producer();
      store.set(composite, { payloadHash: hash(payload), response, createdAt: now });
      return { response, replayed: false };
    },
    clear() {
      store.clear();
    },
  };
};
