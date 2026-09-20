import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';
import { DEFAULT_CATEGORY_CATALOG } from '../../src/categories/catalog.js';
import { buildCategoryTree } from '../../src/categories/tree.js';

const H = { 'x-device-token': TOKEN_A, 'content-type': 'application/json' };
const HB = { 'x-device-token': TOKEN_B, 'content-type': 'application/json' };

const createCategory = async (app: ReturnType<typeof buildTestApp>['app'], payload: unknown, headers = { ...H, 'idempotency-key': crypto.randomUUID() }) =>
  app.inject({ method: 'POST', url: '/categories', headers, payload });

const applyDefaults = async (app: ReturnType<typeof buildTestApp>['app'], headers = { ...H, 'idempotency-key': crypto.randomUUID() }) =>
  app.inject({ method: 'POST', url: '/categories/apply-defaults', headers, payload: {} });

describe('GET /categories/tree — canonical macro/sub contract', () => {
  it('returns macros with kind macro, type expense|income and nested subs', async () => {
    const { app } = buildTestApp();
    const macro = await createCategory(app, { name: 'Moradia', kind: 'expense', icon: 'Home' });
    expect(macro.statusCode).toBe(201);
    const sub = await createCategory(app, {
      name: 'Aluguel',
      kind: 'expense',
      parentId: macro.json().id,
      icon: 'KeyRound',
    });
    expect(sub.statusCode).toBe(201);

    const res = await app.inject({ method: 'GET', url: '/categories/tree', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      id: macro.json().id,
      name: 'Moradia',
      icon: 'Home',
      kind: 'macro',
      type: 'expense',
      subcategories: [{ id: sub.json().id, name: 'Aluguel', icon: 'KeyRound', kind: 'sub', parentId: macro.json().id }],
    });
  });

  it('is household-scoped and supports kind filter', async () => {
    const { app } = buildTestApp();
    await createCategory(app, { name: 'Salário', kind: 'income' });
    const other = await app.inject({ method: 'GET', url: '/categories/tree', headers: { 'x-device-token': TOKEN_B, 'idempotency-key': crypto.randomUUID() } });
    expect(other.json()).toMatchObject({ items: [], total: 0 });
    const filtered = await app.inject({
      method: 'GET',
      url: '/categories/tree?kind=income',
      headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() },
    });
    expect(filtered.json().total).toBe(1);
    expect(filtered.json().items[0]).toMatchObject({ kind: 'macro', type: 'income' });
  });

  it('requires auth', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/categories/tree' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /categories/apply-defaults — idempotent pt-BR template', () => {
  it('applies the full catalog and is idempotent on re-run', async () => {
    const { app } = buildTestApp();
    const first = await applyDefaults(app);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ok: true });
    expect(first.json().created).toBeGreaterThan(40);
    expect(first.json().skipped).toBe(0);

    const second = await applyDefaults(app);
    expect(second.json().created).toBe(0);
    expect(second.json().skipped).toBe(first.json().created);

    const tree = await app.inject({ method: 'GET', url: '/categories/tree', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    expect(tree.json().total).toBe(DEFAULT_CATEGORY_CATALOG.length);
    const moradia = tree.json().items.find((m: { name: string }) => m.name === 'Moradia');
    expect(moradia.subcategories.map((s: { name: string }) => s.name)).toEqual(
      expect.arrayContaining(['Aluguel', 'Luz', 'Internet']),
    );
    const renda = tree.json().items.find((m: { name: string }) => m.name === 'Renda');
    expect(renda).toMatchObject({ type: 'income' });
  });

  it('reuses a pre-existing same-kind macro instead of duplicating', async () => {
    const { app } = buildTestApp();
    await createCategory(app, { name: 'moradia', kind: 'expense' });
    const res = await applyDefaults(app);
    const tree = await app.inject({ method: 'GET', url: '/categories/tree', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    const moradias = tree.json().items.filter((m: { name: string }) => m.name.toLowerCase() === 'moradia');
    expect(moradias).toHaveLength(1);
    expect(moradias[0].subcategories.length).toBeGreaterThan(0);
    expect(res.json().skipped).toBeGreaterThan(0);
  });

  it('is household-scoped', async () => {
    const { app } = buildTestApp();
    await applyDefaults(app);
    const other = await app.inject({ method: 'GET', url: '/categories/tree', headers: { 'x-device-token': TOKEN_B, 'idempotency-key': crypto.randomUUID() } });
    expect(other.json().total).toBe(0);
  });

  it('bootstraps defaults on first account creation only', async () => {
    const { app } = buildTestApp();
    const acc = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'Nubank', kind: 'bank', initialBalanceCents: 0 },
    });
    expect(acc.statusCode).toBe(201);
    const tree = await app.inject({ method: 'GET', url: '/categories/tree', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    expect(tree.json().total).toBe(DEFAULT_CATEGORY_CATALOG.length);
    // Second account does not duplicate.
    await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'Itaú', kind: 'bank', initialBalanceCents: 0 },
    });
    const again = await app.inject({ method: 'GET', url: '/categories', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    const macros = again.json().items.filter((c: { parentId?: string }) => !c.parentId);
    expect(macros).toHaveLength(DEFAULT_CATEGORY_CATALOG.length);
  });
});

describe('subcategoryId on records', () => {
  it('accepts a valid subcategoryId on expense create', async () => {
    const { app } = buildTestApp();
    const acc = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'X', kind: 'bank', initialBalanceCents: 10000 },
    });
    const macro = await createCategory(app, { name: 'Comida', kind: 'expense' });
    const sub = await createCategory(app, { name: 'Mercado', kind: 'expense', parentId: macro.json().id });
    const res = await app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: {
        description: 'Feira',
        amountCents: 1000,
        date: '2026-06-10',
        accountId: acc.json().id,
        categoryId: macro.json().id,
        subcategoryId: sub.json().id,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().subcategoryId).toBe(sub.json().id);
  });

  it('rejects a macro id as subcategoryId and cross-kind subs', async () => {
    const { app } = buildTestApp();
    const acc = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'X', kind: 'bank', initialBalanceCents: 10000 },
    });
    const macro = await createCategory(app, { name: 'Comida', kind: 'expense' });
    const salary = await createCategory(app, { name: 'Salário Extra', kind: 'income' });
    const bonus = await createCategory(app, { name: 'Bônus', kind: 'income', parentId: salary.json().id });
    const base = {
      description: 'Y',
      amountCents: 100,
      date: '2026-06-10',
      accountId: acc.json().id,
      categoryId: macro.json().id,
    };
    const asMacro = await app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { ...base, subcategoryId: macro.json().id },
    });
    expect(asMacro.statusCode).toBe(400);
    const crossKind = await app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { ...base, subcategoryId: bonus.json().id },
    });
    expect(crossKind.statusCode).toBe(400);
  });

  it('rejects a subcategory from another macro as subcategoryId (M-03 parent check)', async () => {
    const { app } = buildTestApp();
    const acc = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'X', kind: 'bank', initialBalanceCents: 10000 },
    });
    const macroA = await createCategory(app, { name: 'Comida', kind: 'expense' });
    const macroB = await createCategory(app, { name: 'Bricolagem', kind: 'expense' });
    const subA = await createCategory(app, { name: 'Feira', kind: 'expense', parentId: macroA.json().id });
    const res = await app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: {
        description: 'Y',
        amountCents: 100,
        date: '2026-06-10',
        accountId: acc.json().id,
        categoryId: macroB.json().id,
        subcategoryId: subA.json().id,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.invalid');
  });

  it('rejects a cross-household subcategoryId (M-03 household check)', async () => {
    const { app } = buildTestApp();
    const acc = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'X', kind: 'bank', initialBalanceCents: 10000 },
    });
    const macro = await createCategory(app, { name: 'Comida', kind: 'expense' });
    // Same tree shape in household B; its sub id must not resolve in A.
    const macroB = await createCategory(app, { name: 'Comida', kind: 'expense' }, { ...HB, 'idempotency-key': crypto.randomUUID() });
    expect(macroB.statusCode).toBe(201);
    const subB = await createCategory(app, { name: 'Mercado', kind: 'expense', parentId: macroB.json().id }, { ...HB, 'idempotency-key': crypto.randomUUID() });
    expect(subB.statusCode).toBe(201);
    const res = await app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: {
        description: 'Y',
        amountCents: 100,
        date: '2026-06-10',
        accountId: acc.json().id,
        categoryId: macro.json().id,
        subcategoryId: subB.json().id,
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('not_found');
  });

  it('changing only the parent category clears a retained foreign subcategory (M-03 coherence)', async () => {
    const { app } = buildTestApp();
    const acc = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'X', kind: 'bank', initialBalanceCents: 10000 },
    });
    const macroA = await createCategory(app, { name: 'Comida', kind: 'expense' });
    const macroB = await createCategory(app, { name: 'Bricolagem', kind: 'expense' });
    const subA = await createCategory(app, { name: 'Feira', kind: 'expense', parentId: macroA.json().id });
    const tx = await app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: {
        description: 'Feira',
        amountCents: 1000,
        date: '2026-06-10',
        accountId: acc.json().id,
        categoryId: macroA.json().id,
        subcategoryId: subA.json().id,
      },
    });
    expect(tx.statusCode).toBe(201);
    const upd = await app.inject({
      method: 'PATCH',
      url: `/transactions/${tx.json().id}`,
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { categoryId: macroB.json().id },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().categoryId).toBe(macroB.json().id);
    expect(upd.json().subcategoryId).toBeUndefined();
  });
});

describe('POST /categories/:id/delete — move or cascade', () => {
  const setupMacroWithTx = async () => {
    const { app } = buildTestApp();
    const acc = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'X', kind: 'bank', initialBalanceCents: 100000 },
    });
    const macro = await createCategory(app, { name: 'Comida', kind: 'expense' });
    const sub = await createCategory(app, { name: 'Mercado', kind: 'expense', parentId: macro.json().id });
    const tx = await app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: {
        description: 'Feira',
        amountCents: 1000,
        date: '2026-06-10',
        accountId: acc.json().id,
        categoryId: macro.json().id,
        subcategoryId: sub.json().id,
      },
    });
    // Note: the first account creation bootstraps the default template,
    // so tree assertions below account for those rows where relevant.
    return { app, macroId: macro.json().id as string, subId: sub.json().id as string, txId: tx.json().id as string };
  };

  it('requires a destination in move mode', async () => {
    const { app, macroId } = await setupMacroWithTx();
    const res = await app.inject({
      method: 'POST',
      url: `/categories/${macroId}/delete`,
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { mode: 'move' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('moves records to the destination and deactivates macro + subs', async () => {
    const { app, macroId, txId } = await setupMacroWithTx();
    const dest = await createCategory(app, { name: 'Ajustes Manuais', kind: 'expense' });
    expect(dest.statusCode).toBe(201);
    const res = await app.inject({
      method: 'POST',
      url: `/categories/${macroId}/delete`,
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { mode: 'move', destinationCategoryId: dest.json().id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, movedTransactions: 1, softDeletedTransactions: 0 });
    const txs = await app.inject({ method: 'GET', url: '/transactions', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    const tx = txs.json().items.find((t: { id: string }) => t.id === txId);
    expect(tx.categoryId).toBe(dest.json().id);
    expect(tx.subcategoryId).toBeUndefined();
    const tree = await app.inject({ method: 'GET', url: '/categories/tree', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    // Only bootstrapped defaults + destination remain; the deleted macro is gone.
    expect(tree.json().items.some((m: { id: string }) => m.id === macroId)).toBe(false);
  });

  it('cascade without confirm:true is rejected; with confirm soft-deletes records', async () => {
    const { app, macroId, txId } = await setupMacroWithTx();
    const noConfirm = await app.inject({
      method: 'POST',
      url: `/categories/${macroId}/delete`,
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { mode: 'cascade' },
    });
    expect(noConfirm.statusCode).toBe(400);
    const res = await app.inject({
      method: 'POST',
      url: `/categories/${macroId}/delete`,
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { mode: 'cascade', confirm: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, softDeletedTransactions: 1 });
    const txs = await app.inject({ method: 'GET', url: '/transactions', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    expect(txs.json().items.some((t: { id: string }) => t.id === txId)).toBe(false);
  });

  it('rejects a destination of a different kind or inside the deleted scope', async () => {
    const { app, macroId, subId } = await setupMacroWithTx();
    const income = await createCategory(app, { name: 'Salário Extra', kind: 'income' });
    expect(income.statusCode).toBe(201);
    const crossKind = await app.inject({
      method: 'POST',
      url: `/categories/${macroId}/delete`,
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { mode: 'move', destinationCategoryId: income.json().id },
    });
    expect(crossKind.statusCode).toBe(400);
    const inScope = await app.inject({
      method: 'POST',
      url: `/categories/${macroId}/delete`,
      headers: { ...H, 'idempotency-key': crypto.randomUUID() },
      payload: { mode: 'move', destinationCategoryId: subId },
    });
    expect(inScope.statusCode).toBe(400);
  });

  it('is household-scoped (cannot delete another household macro)', async () => {
    const { app, macroId } = await setupMacroWithTx();
    const res = await app.inject({
      method: 'POST',
      url: `/categories/${macroId}/delete`,
      headers: { ...HB, 'idempotency-key': crypto.randomUUID() },
      payload: { mode: 'cascade', confirm: true },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('V045 migration + catalog units', () => {
  it('V045 is registered in canonical and legacy manifests', () => {
    expect(expectedMigrationManifest(false).map((e) => e.version)).toContain(45);
    expect(expectedMigrationManifest(true).map((e) => e.version)).toContain(45);
  });

  it('existing categories become macros (no orphans): tree drops nothing it should keep', () => {
    const tree = buildCategoryTree([
      { id: 'a', householdId: HOUSEHOLD_A, name: 'Antiga', kind: 'expense', status: 'active' },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: 'macro', type: 'expense', subcategories: [] });
  });

  it('orders by sortOrder then pt-BR name', () => {
    const tree = buildCategoryTree([
      { id: 'b', householdId: HOUSEHOLD_A, name: 'Zebra', kind: 'expense', status: 'active', sortOrder: 0 },
      { id: 'a', householdId: HOUSEHOLD_A, name: 'Abacaxi', kind: 'expense', status: 'active', sortOrder: 1 },
    ]);
    expect(tree.map((m) => m.name)).toEqual(['Zebra', 'Abacaxi']);
  });
});
