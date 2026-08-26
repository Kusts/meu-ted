/**
 * In-memory implementation of WriteStore.
 *
 * Mutates the same arrays that `createInMemoryReadModelStore` reads
 * from. Both factories share state when constructed together via
 * `createInMemoryStores`.
 *
 * The shared state pattern is the simplest way to keep read and write
 * sides in sync without a full repository abstraction. The Postgres
 * side achieves the same via real transactions.
 */

import { randomUUID } from 'node:crypto';
import type { Account, Category, Transaction } from '../types/domain.js';
import { domainErrors } from './errors.js';
import type { WriteStore } from './store.js';
import type {
  CreateAccountInput,
  CreateCategoryInput,
  CreateExpenseInput,
  CreateIncomeInput,
  CreateTransferInput,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateTransactionInput,
} from './types.js';

export type InMemoryState = {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  /** Soft-deleted transaction ids, per household. Read store filters these out. */
  deletedTransactions: Set<string>;
};

export const createInMemoryWriteStore = (state: InMemoryState): WriteStore => {
  const findAccount = (id: string, householdId: string): Account => {
    const a = state.accounts.find((x) => x.id === id && x.householdId === householdId);
    if (!a) throw domainErrors.notFound('Conta');
    return a;
  };
  const findCategory = (id: string, householdId: string): Category => {
    const c = state.categories.find((x) => x.id === id && x.householdId === householdId);
    if (!c) throw domainErrors.notFound('Categoria');
    return c;
  };
  const findTransaction = (id: string, householdId: string): Transaction => {
    const t = state.transactions.find((x) => x.id === id && x.householdId === householdId);
    if (!t) throw domainErrors.notFound('Lançamento');
    if (state.deletedTransactions.has(t.id)) throw domainErrors.notFound('Lançamento');
    return t;
  };

  const assertNotDeleted = (e: { deletedAt?: string; status: string } | null): void => {
    if (!e) return;
    if ('deletedAt' in e && e.deletedAt) throw domainErrors.notFound('Lançamento');
    if (e.status === 'inactive') throw domainErrors.notFound('Conta');
  };

  return {
async createAccount(householdId, input) {
      const duplicate = state.accounts.some(
        (existing) =>
          existing.householdId === householdId &&
          existing.status === 'active' &&
          existing.name.toLowerCase() === input.name.toLowerCase(),
      );
      if (duplicate) throw domainErrors.inUse('Conta', 'nome duplicado');
      const acc: Account = {

        id: randomUUID(),
        householdId,
        name: input.name,
        kind: input.kind,
        balanceCents: input.initialBalanceCents,
        status: 'active',
      };
      state.accounts.push(acc);
      return acc;
    },

    async updateAccount(householdId, id, patch) {
      const acc = findAccount(id, householdId);
      if (acc.status !== 'active') throw domainErrors.notFound('Conta');
      if (patch.name !== undefined) acc.name = patch.name;
      return acc;
    },

    async deactivateAccount(householdId, id) {
      const acc = findAccount(id, householdId);
      if (acc.status !== 'active') throw domainErrors.notFound('Conta');
      const referenced = state.transactions.some(
        (t) => t.householdId === householdId && (t.accountId === id || t.transferToAccountId === id),
      );
      if (referenced) throw domainErrors.inUse('Conta', 'lançamentos');
      acc.status = 'inactive';
      return acc;
    },

    async createCategory(householdId, input) {
      const duplicate = state.categories.some(
        (existing) =>
          existing.householdId === householdId &&
          existing.status === 'active' &&
          existing.name.toLowerCase() === input.name.toLowerCase(),
      );
      if (duplicate) throw domainErrors.inUse('Categoria', 'nome duplicado');
      if (input.parentId) {

        const parent = state.categories.find(
          (c) => c.id === input.parentId && c.householdId === householdId && c.status === 'active',
        );
        if (!parent) throw domainErrors.notFound('Categoria pai');
        if (parent.parentId) throw domainErrors.invalid('parentId', 'subcategoria não pode ter subcategoria');
        if (parent.kind !== input.kind) {
          throw domainErrors.invalid('parentId', 'categoria pai deve ter o mesmo kind');
        }
      }
      const cat: Category = {
        id: randomUUID(),
        householdId,
        name: input.name,
        kind: input.kind,
        status: 'active',
        ...(input.parentId ? { parentId: input.parentId } : {}),
      };
      state.categories.push(cat);
      return cat;
    },

    async updateCategory(householdId, id, patch) {
      const cat = findCategory(id, householdId);
      if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
      if (patch.name !== undefined) cat.name = patch.name;
      return cat;
    },

    async deactivateCategory(householdId, id) {
      const cat = findCategory(id, householdId);
      if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
      const referenced = state.transactions.some(
        (t) => t.householdId === householdId && t.categoryId === id,
      );
      if (referenced) throw domainErrors.inUse('Categoria', 'lançamentos');
      cat.status = 'inactive';
      return cat;
    },

    async createExpense(householdId, input) {
      const acc = findAccount(input.accountId, householdId);
      assertNotDeleted(acc);
      const cat = findCategory(input.categoryId, householdId);
      assertNotDeleted(cat);
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      const tx: Transaction = {
        id: randomUUID(),
        householdId,
        kind: 'expense',
        description: input.description,
        amountCents: input.amountCents,
        date: input.date,
        accountId: input.accountId,
        categoryId: input.categoryId,
      };
      state.transactions.push(tx);
      acc.balanceCents = Math.max(0, acc.balanceCents - input.amountCents);
      return tx;
    },

    async createIncome(householdId, input) {
      const acc = findAccount(input.accountId, householdId);
      assertNotDeleted(acc);
      const cat = findCategory(input.categoryId, householdId);
      assertNotDeleted(cat);
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      const tx: Transaction = {
        id: randomUUID(),
        householdId,
        kind: 'income',
        description: input.description,
        amountCents: input.amountCents,
        date: input.date,
        accountId: input.accountId,
        categoryId: input.categoryId,
      };
      state.transactions.push(tx);
      acc.balanceCents += input.amountCents;
      return tx;
    },

    async createTransfer(householdId, input) {
      if (input.fromAccountId === input.toAccountId) {
        throw domainErrors.invalid('toAccountId', 'deve ser diferente da conta de origem');
      }
      const from = findAccount(input.fromAccountId, householdId);
      assertNotDeleted(from);
      const to = findAccount(input.toAccountId, householdId);
      assertNotDeleted(to);
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      const tx: Transaction = {
        id: randomUUID(),
        householdId,
        kind: 'transfer',
        description: input.description,
        amountCents: input.amountCents,
        date: input.date,
        accountId: input.fromAccountId,
        transferToAccountId: input.toAccountId,
      };
      state.transactions.push(tx);
      from.balanceCents = Math.max(0, from.balanceCents - input.amountCents);
      to.balanceCents += input.amountCents;
      return tx;
    },

    async updateTransaction(householdId, id, patch) {
      const tx = findTransaction(id, householdId);
      if (tx.kind === 'transfer') {
        // Limited: description + date only.
        if (patch.description !== undefined) tx.description = patch.description;
        if (patch.date !== undefined) tx.date = patch.date;
        if (
          patch.amountCents !== undefined ||
          patch.accountId !== undefined ||
          patch.categoryId !== undefined
        ) {
          throw domainErrors.unsupported(
            'transferências só podem ter descrição e data alteradas',
          );
        }
        return tx;
      }
      // expense / income
      if (patch.description !== undefined) tx.description = patch.description;
      if (patch.date !== undefined) tx.date = patch.date;
      if (patch.amountCents !== undefined) {
        if (patch.amountCents <= 0) {
          throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
        }
        // Restore old balance, then apply new.
        const acc = findAccount(tx.accountId, householdId);
        if (tx.kind === 'expense') {
          acc.balanceCents = Math.min(acc.balanceCents + tx.amountCents, Number.MAX_SAFE_INTEGER);
          acc.balanceCents = Math.max(0, acc.balanceCents - patch.amountCents);
        } else {
          acc.balanceCents = Math.max(0, acc.balanceCents - tx.amountCents);
          acc.balanceCents = acc.balanceCents + patch.amountCents;
        }
        tx.amountCents = patch.amountCents;
      }
      if (patch.accountId !== undefined) {
        const old = findAccount(tx.accountId, householdId);
        const next = findAccount(patch.accountId, householdId);
        assertNotDeleted(next);
        // Move balance effect.
        if (tx.kind === 'expense') {
          old.balanceCents = Math.min(old.balanceCents + tx.amountCents, Number.MAX_SAFE_INTEGER);
          next.balanceCents = Math.max(0, next.balanceCents - tx.amountCents);
        } else {
          old.balanceCents = Math.max(0, old.balanceCents - tx.amountCents);
          next.balanceCents = next.balanceCents + tx.amountCents;
        }
        tx.accountId = patch.accountId;
      }
      if (patch.categoryId !== undefined) {
        const cat = findCategory(patch.categoryId, householdId);
        assertNotDeleted(cat);
        tx.categoryId = patch.categoryId;
      }
      return tx;
    },

    async softDeleteTransaction(householdId, id) {
      const tx = findTransaction(id, householdId);
      if (state.deletedTransactions.has(tx.id)) {
        throw domainErrors.notFound('Lançamento');
      }
      // Restore balance effect.
      if (tx.kind === 'expense') {
        const acc = findAccount(tx.accountId, householdId);
        acc.balanceCents = Math.min(acc.balanceCents + tx.amountCents, Number.MAX_SAFE_INTEGER);
      } else if (tx.kind === 'income') {
        const acc = findAccount(tx.accountId, householdId);
        acc.balanceCents = Math.max(0, acc.balanceCents - tx.amountCents);
      } else if (tx.kind === 'transfer') {
        const from = findAccount(tx.accountId, householdId);
        const to = tx.transferToAccountId
          ? findAccount(tx.transferToAccountId, householdId)
          : null;
        from.balanceCents = Math.min(from.balanceCents + tx.amountCents, Number.MAX_SAFE_INTEGER);
        if (to) to.balanceCents = Math.max(0, to.balanceCents - tx.amountCents);
      }
      // Soft delete: tombstone. Read store filters these out.
      state.deletedTransactions.add(tx.id);
      return tx;
    },
  };
};

/**
 * Compose read and write stores over the same in-memory state.
 */
export const createInMemoryStores = (seed?: {
  accounts?: Account[];
  categories?: Category[];
  transactions?: Transaction[];
}): { state: InMemoryState; writes: ReturnType<typeof createInMemoryWriteStore> } => {
  const state: InMemoryState = {
    accounts: seed?.accounts ?? [],
    categories: seed?.categories ?? [],
    transactions: seed?.transactions ?? [],
    deletedTransactions: new Set(),
  };
  return { state, writes: createInMemoryWriteStore(state) };
};
