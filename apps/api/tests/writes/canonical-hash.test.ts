/**
 * V4.1 Phase 3 Tasks 3.5–3.7 — canonical JSON + SHA-256 V2 + V1 compatibility.
 *
 * RED: `writes/canonical-json.ts`, `hashPayloadV2` and `matchesPayloadHash`
 * do not exist yet.
 */
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/writes/canonical-json.js';
import {
  hashIdempotencyPayload,
  hashPayloadV2,
  matchesPayloadHash,
} from '../../src/writes/idempotency.js';

describe('V4.1 Phase 3 — canonical JSON (Task 3.5)', () => {
  it('sorts object keys recursively so key order never changes the output', () => {
    const a = { description: 'Lunch', amountCents: 1500, nested: { z: 1, a: 2 } };
    const b = { nested: { a: 2, z: 1 }, amountCents: 1500, description: 'Lunch' };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"amountCents":1500,"description":"Lunch","nested":{"a":2,"z":1}}');
  });

  it('preserves array order and nulls', () => {
    expect(canonicalJson({ list: [3, 1, 2], missing: null })).toBe('{"list":[3,1,2],"missing":null}');
    expect(canonicalJson({ list: [1, 2, 3] })).not.toBe(canonicalJson({ list: [3, 2, 1] }));
  });

  it('drops undefined object properties (no undefined in the output)', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson({ a: undefined })).toBe('{}');
  });

  it('round-trips through JSON.parse', () => {
    const payload = { key: 'k', nested: { n: 1 }, tags: ['b', 'a'], nothing: null };
    expect(JSON.parse(canonicalJson(payload))).toEqual(payload);
  });
});

describe('V4.1 Phase 3 — SHA-256 V2 (Task 3.6)', () => {
  it('hashPayloadV2 = sha256("v2:" + canonicalJson(input)) as 64-hex', async () => {
    const { createHash } = await import('node:crypto');
    const input = { amountCents: 5000, description: 'X' };
    const expected = createHash('sha256').update(`v2:${canonicalJson(input)}`).digest('hex');
    expect(hashPayloadV2(input)).toBe(expected);
    expect(hashPayloadV2(input)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is order-insensitive (unlike the legacy top-level-only hash)', () => {
    const a = { b: 2, a: { y: 1, x: 0 } };
    const b = { a: { x: 0, y: 1 }, b: 2 };
    expect(hashPayloadV2(a)).toBe(hashPayloadV2(b));
  });
});

describe('V4.1 Phase 3 — V1 compatibility (Task 3.7)', () => {
  it('matches a stored V2 hash', () => {
    const payload = { amountCents: 100, description: 'Café' };
    expect(matchesPayloadHash(hashPayloadV2(payload), payload)).toBe(true);
  });

  it('matches a stored v1-sha256 hash (hashIdempotencyPayload, version 1)', () => {
    const payload = { amountCents: 100 };
    expect(matchesPayloadHash(hashIdempotencyPayload(payload), payload)).toBe(true);
  });

  it('matches a stored legacy 32-bit hash (writes/postgres.ts h*31, no version)', () => {
    const payload = { amountCents: 100 };
    const json = JSON.stringify(payload, Object.keys(payload).sort());
    let h = 0;
    for (let i = 0; i < json.length; i++) h = (h * 31 + json.charCodeAt(i)) | 0;
    expect(matchesPayloadHash(String(h), payload)).toBe(true);
  });

  it('rejects a hash that matches neither V2 nor V1 recomputation', () => {
    expect(matchesPayloadHash('deadbeef', { amountCents: 100 })).toBe(false);
    expect(matchesPayloadHash('0', { amountCents: 100 })).toBe(false);
  });
});
