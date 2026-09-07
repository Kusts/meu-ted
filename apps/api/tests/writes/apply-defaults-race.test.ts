/**
 * M-02: concurrent default-catalog applications converge without duplicates.
 *
 * Drives two interleaved applyDefaultsInTx calls against a fake executor
 * that emulates the V048 unique-index semantics (duplicate INSERT with the
 * same household/kind/parent/name is ignored). Asserts a single catalog set
 * survives the race — the outcome the old check-then-insert could not
 * guarantee.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyDefaultsInTx } from '../../src/writes/postgres.js';
import { DEFAULT_CATEGORY_CATALOG } from '../../src/categories/catalog.js';

type Row = Record<string, unknown>;

const ZERO_PARENT = '00000000-0000-0000-0000-000000000000';

const makeRacyClient = () => {
  const categories: Row[] = [];
  let seq = 0;
  const keyOf = (household: string, kind: string, parent: string | null, name: string) =>
    `${household}|${kind}|${parent ?? ZERO_PARENT}|${String(name).toLowerCase()}`;
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    await Promise.resolve();
    if (text.includes('INSERT INTO categories')) {
      // Macro inserts carry a NULL parent literal; sub inserts pass $4.
      const isMacro = text.includes(`'active', NULL,`);
      const [householdId, name, kind] = values as [string, string, string];
      const parentId = (isMacro ? null : (values[3] as string | null));
      const key = keyOf(householdId, kind, parentId, name);
      const dup = categories.some((c) => keyOf(c['household_id'] as string, c['kind'] as string, (c['parent_id'] as string | null) ?? null, c['name'] as string) === key);
      if (dup) return { rows: [], rowCount: 0 };
      seq += 1;
      const row = { id: `cat-${seq}`, household_id: householdId, name, kind, parent_id: parentId };
      categories.push(row);
      return { rows: [{ id: row['id'] }], rowCount: 1 };
    }
    if (text.includes('SELECT id FROM categories')) {
      const [householdId, kind, name] = values as [string, string, string];
      const hit = categories.find(
        (c) => c['household_id'] === householdId && (c['parent_id'] ?? null) === null && c['kind'] === kind && String(c['name']).toLowerCase() === String(name).toLowerCase(),
      );
      return { rows: hit ? [{ id: hit['id'] }] : [], rowCount: hit ? 1 : 0 };
    }
    throw new Error(`unexpected query: ${text.slice(0, 60)}`);
  });
  return { client: { query }, categories, query };
};

const expectedRows = DEFAULT_CATEGORY_CATALOG.length +
  DEFAULT_CATEGORY_CATALOG.reduce((n, m) => n + m.subs.length, 0);

describe('M-02 concurrent applyDefaults converges (fake client)', () => {
  it('two interleaved applications create exactly one catalog set', async () => {
    const { client, categories } = makeRacyClient();
    const [first, second] = await Promise.all([
      applyDefaultsInTx(client as never, 'h1'),
      applyDefaultsInTx(client as never, 'h1'),
    ]);
    expect(categories).toHaveLength(expectedRows);
    expect(first.created + first.skipped).toBe(expectedRows);
    expect(second.created + second.skipped).toBe(expectedRows);
    // No duplicate names within the same parent scope.
    const keys = categories.map((c) =>
      `${c['kind']}|${(c['parent_id'] as string | null) ?? ZERO_PARENT}|${String(c['name']).toLowerCase()}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sequential re-application creates nothing', async () => {
    const { client } = makeRacyClient();
    const first = await applyDefaultsInTx(client as never, 'h1');
    expect(first.created).toBe(expectedRows);
    const second = await applyDefaultsInTx(client as never, 'h1');
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(expectedRows);
  });
});
