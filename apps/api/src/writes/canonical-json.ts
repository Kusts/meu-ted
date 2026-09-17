/**
 * V4.1 Phase 3 Task 3.5 — canonical JSON for idempotency payload hashing.
 *
 * Rules (SPEC §10.3):
 * - object keys sorted recursively (lexicographic code-unit order);
 * - arrays preserve order;
 * - null preserved;
 * - undefined / function / symbol object properties are omitted;
 * - undefined / function / symbol array items become null (JSON semantics);
 * - strings exact, numbers deterministic (JSON number grammar);
 * - Date values serialize via toJSON (ISO-8601), like JSON.stringify.
 *
 * The output is always valid JSON for JSON-representable inputs and parses
 * back to an equal value.
 */

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

const canonicalize = (value: unknown): unknown => {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (value === null) return null;
  if (value instanceof Date) return value.toJSON();
  if (Array.isArray(value)) {
    return value.map((item) => {
      const next = canonicalize(item);
      return next === undefined ? null : next;
    });
  }
  if (isPlainRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const next = canonicalize(value[key]);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
};

export const canonicalJson = (value: unknown): string => {
  const canonical = canonicalize(value);
  // Top-level undefined has no JSON representation; hash a stable marker.
  if (canonical === undefined) return 'null';
  return JSON.stringify(canonical);
};
