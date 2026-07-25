/**
 * Contract test suite for any ReadModelStore implementation.
 *
 * Usage:
 *   runReadModelStoreContract({
 *     name: 'in-memory',
 *     create: () => Promise.resolve(createInMemoryReadModelStore(seed))
 *   })
 *   runReadModelStoreContract({
 *     name: 'postgres',
 *     create: async () => createPostgresReadModelStore({ pool, deviceTokens })
 *   })
 *
 * This file deliberately exports a function (not a top-level `describe`).
 * Each backend registers its own `describe` with the contract suite inside.
 */

import { describe, it, expect } from 'vitest';
import type { Account, Category, Transaction } from '../../src/types/domain.js';
import type { ReadModelStore } from '../../src/read-models/store.js';

export type ContractHarness = {
  name: string;
  create: () => Promise<{ store: ReadModelStore; cleanup: () => Promise<void> }>;
  /** Optional pre-seed for tests; default uses a small in-memory seed bundled here. */
  seed?: {
    accounts: Account[];
    categories: Category[];
    transactions: Transaction[];
    householdId: string;
    otherHouseholdId: string;
  };
};

const typed = <T>(v: T): T => v;

const H1 = '00000000-0000-4000-8000-00000000000a';
const H2 = '00000000-0000-4000-8000-00000000000b';

export const defaultContractSeed = (): {
  householdId: string;
  otherHouseholdId: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
} => ({
  householdId: H1,
  otherHouseholdId: H2,
  accounts: [
    { id: '11111111-1111-4111-8111-111111111111', householdId: H1, name: 'A1', kind: 'bank', balanceCents: 100_000, status: 'active' },
    { id: '11111111-1111-4111-8111-111111111112', householdId: H1, name: 'A2', kind: 'cash', balanceCents: 50_000, status: 'active' },
    { id: '11111111-1111-4111-8111-111111111113', householdId: H2, name: 'B1', kind: 'bank', balanceCents: 999, status: 'active' },
  ],
  categories: [
    { id: '22222222-2222-4222-8222-222222222221', householdId: H1, name: 'Food', kind: 'expense', status: 'active' },
    { id: '22222222-2222-4222-8222-222222222222', householdId: H1, name: 'Salary', kind: 'income', status: 'active' },
  ],
  transactions: [
    { id: '33333333-3333-4333-8333-333333333301', householdId: H1, kind: 'expense' as const, description: 'Mercado', amountCents: 480, date: '2026-06-10', accountId: '11111111-1111-4111-8111-111111111111', categoryId: '22222222-2222-4222-8222-222222222221' },
    { id: '33333333-3333-4333-8333-333333333302', householdId: H1, kind: 'income' as const, description: 'Salário', amountCents: 12_000, date: '2026-06-01', accountId: '11111111-1111-4111-8111-111111111111', categoryId: '22222222-2222-4222-8222-222222222222' },
    { id: '33333333-3333-4333-8333-333333333303', householdId: H1, kind: 'transfer' as const, description: 'A1 → A2', amountCents: 500, date: '2026-06-08', accountId: '11111111-1111-4111-8111-111111111111', transferToAccountId: '11111111-1111-4111-8111-111111111112' },
    { id: '33333333-3333-4333-8333-333333333304', householdId: H2, kind: 'expense' as const, description: 'Other', amountCents: 100, date: '2026-06-09', accountId: '11111111-1111-4111-8111-111111111113' },
  ],
}) as ReturnType<typeof defaultContractSeed>;

export const runReadModelStoreContract = (harness: ContractHarness): void => {
  describe(`ReadModelStore contract: ${harness.name}`, () => {
    let store: ReadModelStore;
    let cleanup: () => Promise<void>;
    let seed: ReturnType<typeof defaultContractSeed>;

    const setup = async (): Promise<void> => {
      seed = harness.seed ?? defaultContractSeed();
      const result = await harness.create();
      store = result.store;
      cleanup = result.cleanup;
    };

    it('listAccounts returns only active bank/cash for the household', async () => {
      await setup();
      const accounts = await store.listAccounts(seed.householdId);
      expect(accounts.every((a) => a.status === 'active' && a.kind !== 'credit_card')).toBe(true);
      expect(accounts.every((a) => a.householdId === seed.householdId)).toBe(true);
    });

    it('listAccounts scopes by household (no cross-tenant leak)', async () => {
      await setup();
      const a = await store.listAccounts(seed.householdId);
      const b = await store.listAccounts(seed.otherHouseholdId);
      expect(a).toHaveLength(2);
      expect(b).toHaveLength(1);
      expect(b[0]?.householdId).toBe(seed.otherHouseholdId);
    });

    it('listCategories returns active categories for the household', async () => {
      await setup();
      const cats = await store.listCategories(seed.householdId);
      expect(cats.length).toBeGreaterThan(0);
      expect(cats.every((c) => c.status === 'active' && c.householdId === seed.householdId)).toBe(true);
    });

    it('listTransactions scopes by household', async () => {
      await setup();
      const page = await store.listTransactions(seed.householdId, {} as never);
      expect(page.total).toBe(3);
      for (const t of page.items) {
        expect(t.householdId).toBe(seed.householdId);
      }
    });

    it('listTransactions respects limit and offset', async () => {
      await setup();
      const p1 = await store.listTransactions(seed.householdId, { limit: 2, offset: 0 } as never);
      const p2 = await store.listTransactions(seed.householdId, { limit: 2, offset: 2 } as never);
      expect(p1.items).toHaveLength(2);
      expect(p2.items).toHaveLength(1);
      expect(p1.total).toBe(3);
    });

    it('listTransactions sorted by date desc (most recent first)', async () => {
      await setup();
      const page = await store.listTransactions(seed.householdId, { limit: 100 } as never);
      const dates = page.items.map((t) => t.date);
      const sorted = [...dates].sort().reverse();
      expect(dates).toEqual(sorted);
    });

    it('listAllTransactions returns every transaction for the household', async () => {
      await setup();
      const all = await store.listAllTransactions(seed.householdId);
      expect(all).toHaveLength(3);
    });

    it('listAllTransactions never returns other households', async () => {
      await setup();
      const all = await store.listAllTransactions(seed.householdId);
      expect(all.every((t) => t.householdId === seed.householdId)).toBe(true);
    });

    it('teardown is safe to call', async () => {
      await setup();
      await cleanup();
      // Calling cleanup again should not throw.
      await cleanup();
    });
  });
};
