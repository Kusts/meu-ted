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
import { DEFAULT_CATEGORY_CATALOG } from '../categories/catalog.js';
import { domainErrors, DomainError } from './errors.js';
import { hashIdempotencyPayload } from './idempotency.js';
import { namespacedPendingV2Key } from './pending-idempotency.js';
import type { ApplyDefaultsResult, DeleteCategoryResult, WriteStore } from './store.js';
import type {
  CreateExpenseInput,
  CreateIncomeInput,
  DeleteCategoryInput,
} from './types.js';

export type InMemoryState = {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  /** Soft-deleted transaction ids, per household. Read store filters these out. */
  deletedTransactions: Set<string>;
};

/**
 * Idempotent application of the pt-BR default catalog to a household.
 * Existing same-kind macros (case-insensitive name match) are reused;
 * subs are matched under their resolved macro. Shared by
 * applyCategoryDefaults and the createAccount bootstrap.
 */
export const applyDefaultsToState = (state: InMemoryState, householdId: string): ApplyDefaultsResult => {
  let created = 0;
  let skipped = 0;
  const activeOf = (): Category[] =>
    state.categories.filter((c) => c.householdId === householdId && c.status === 'active');
  DEFAULT_CATEGORY_CATALOG.forEach((macro, macroIdx) => {
    let macroRow = activeOf().find(
      (c) => !c.parentId && c.kind === macro.kind && c.name.toLowerCase() === macro.name.toLowerCase(),
    );
    if (!macroRow) {
      macroRow = {
        id: randomUUID(),
        householdId,
        name: macro.name,
        kind: macro.kind,
        status: 'active',
        icon: macro.icon,
        color: macro.color,
        sortOrder: macroIdx,
        isDefault: true,
        isSystem: false,
      };
      state.categories.push(macroRow);
      created += 1;
    } else {
      skipped += 1;
    }
    for (const sub of macro.subs) {
      const exists = activeOf().find(
        (c) => c.parentId === macroRow!.id && c.name.toLowerCase() === sub.name.toLowerCase(),
      );
      if (exists) {
        skipped += 1;
        continue;
      }
      state.categories.push({
        id: randomUUID(),
        householdId,
        name: sub.name,
        kind: macro.kind,
        status: 'active',
        parentId: macroRow!.id,
        icon: sub.icon,
        isDefault: true,
        isSystem: false,
      });
      created += 1;
    }
  });
  return { created, skipped };
};

/**
 * Centralized subcategory validation for expense/income writes (M-03).
 * Same-household, active, real subcategory with matching kind; when the
 * entry names a distinct parent category, the subcategory must belong to it.
 */
export const resolveSubcategory = (
  state: InMemoryState,
  householdId: string,
  subcategoryId: string,
  txKind: 'expense' | 'income',
  parentCategoryId?: string,
): Category => {
  const sub = state.categories.find((c) => c.id === subcategoryId && c.householdId === householdId);
  if (!sub || sub.status !== 'active') throw domainErrors.notFound('Subcategoria');
  if (!sub.parentId) throw domainErrors.invalid('subcategoryId', 'deve ser uma subcategoria');
  if (sub.kind !== txKind) {
    throw domainErrors.invalid('subcategoryId', 'subcategoria deve ter o mesmo kind do lançamento');
  }
  if (parentCategoryId !== undefined && parentCategoryId !== subcategoryId && sub.parentId !== parentCategoryId) {
    throw domainErrors.invalid('subcategoryId', 'subcategoria não pertence à categoria informada');
  }
  return sub;
};

const softDeleteTxInState = (state: InMemoryState, tx: Transaction): void => {
  if (tx.kind === 'expense') {
    const acc = state.accounts.find((a) => a.id === tx.accountId && a.householdId === tx.householdId);
    if (acc) acc.balanceCents = Math.min(acc.balanceCents + tx.amountCents, Number.MAX_SAFE_INTEGER);
  } else if (tx.kind === 'income') {
    const acc = state.accounts.find((a) => a.id === tx.accountId && a.householdId === tx.householdId);
    if (acc) acc.balanceCents = Math.max(0, acc.balanceCents - tx.amountCents);
  } else if (tx.kind === 'transfer') {
    // C-04 parity with softDeleteTransaction: reverse both legs.
    const from = state.accounts.find((a) => a.id === tx.accountId && a.householdId === tx.householdId);
    if (from) from.balanceCents = Math.min(from.balanceCents + tx.amountCents, Number.MAX_SAFE_INTEGER);
    if (tx.transferToAccountId) {
      const to = state.accounts.find((a) => a.id === tx.transferToAccountId && a.householdId === tx.householdId);
      if (to) to.balanceCents = Math.max(0, to.balanceCents - tx.amountCents);
    }
  }
  state.deletedTransactions.add(tx.id);
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

  // P1 (audit item 7): key-idempotent V2 execution records. First call
  // executes and records (key → transaction); concurrent or repeated
  // calls with the same key + payload replay without re-executing.
  const idemRecords = new Map<string, { payloadHash: string; transaction: Transaction }>();
  const idemFlights = new Map<string, { payloadHash: string; promise: Promise<Transaction> }>();
  const runKeyed = async (
    householdId: string,
    idempotencyKey: string,
    payload: unknown,
    producer: () => Promise<Transaction>,
  ): Promise<Transaction> => {
    const composite = `${householdId}::${namespacedPendingV2Key(idempotencyKey)}`;
    const payloadHash = hashIdempotencyPayload(payload);
    const hit = idemRecords.get(composite);
    if (hit) {
      if (hit.payloadHash !== payloadHash) throw domainErrors.idempotencyConflict();
      return hit.transaction;
    }
    const flight = idemFlights.get(composite);
    if (flight) {
      if (flight.payloadHash !== payloadHash) throw domainErrors.idempotencyConflict();
      return flight.promise;
    }
    let resolveFlight!: (tx: Transaction) => void;
    let rejectFlight!: (err: unknown) => void;
    const promise = new Promise<Transaction>((res, rej) => {
      resolveFlight = res;
      rejectFlight = rej;
    });
    promise.catch(() => undefined);
    idemFlights.set(composite, { payloadHash, promise });
    try {
      const tx = await producer();
      idemRecords.set(composite, { payloadHash, transaction: tx });
      resolveFlight(tx);
      return tx;
    } catch (err) {
      rejectFlight(err);
      throw err;
    } finally {
      idemFlights.delete(composite);
    }
  };

  const createExpenseUnkeyed = async (householdId: string, input: CreateExpenseInput): Promise<Transaction> => {
    const acc = findAccount(input.accountId, householdId);
    assertNotDeleted(acc);
    // H-01: card purchases must flow through the CardStore (statements,
    // limits, invoice semantics) — never as plain balance expenses.
    if (acc.kind === 'credit_card') {
      throw new DomainError('validation.invalid', 'compra no cartão deve usar /cards/purchases.', 422);
    }
    const cat = findCategory(input.categoryId, householdId);
    assertNotDeleted(cat);
    if (input.subcategoryId !== undefined) {
      resolveSubcategory(state, householdId, input.subcategoryId, 'expense', input.categoryId);
    }
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
      ...(input.subcategoryId !== undefined ? { subcategoryId: input.subcategoryId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    state.transactions.push(tx);
    acc.balanceCents = Math.max(0, acc.balanceCents - input.amountCents);
    return tx;
  };

  const createIncomeUnkeyed = async (householdId: string, input: CreateIncomeInput): Promise<Transaction> => {
    const acc = findAccount(input.accountId, householdId);
    assertNotDeleted(acc);
    // H-01: income on a credit card is rejected (422), not silently booked.
    if (acc.kind === 'credit_card') {
      throw new DomainError('validation.invalid', 'receita não pode usar cartão de crédito.', 422);
    }
    const cat = findCategory(input.categoryId, householdId);
    assertNotDeleted(cat);
    if (input.subcategoryId !== undefined) {
      resolveSubcategory(state, householdId, input.subcategoryId, 'income', input.categoryId);
    }
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
      ...(input.subcategoryId !== undefined ? { subcategoryId: input.subcategoryId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    state.transactions.push(tx);
    acc.balanceCents += input.amountCents;
    return tx;
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
      // Item 11: new accounts bootstrap the default set, but only for
      // households that have no categories yet (explicit apply-defaults
      // covers backfill; seeded households are untouched).
      if (!state.categories.some((c) => c.householdId === householdId && c.status === 'active')) {
        applyDefaultsToState(state, householdId);
      }
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
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      };
      state.categories.push(cat);
      return cat;
    },

    async updateCategory(householdId, id, patch) {
      const cat = findCategory(id, householdId);
      if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
      if (patch.name !== undefined) cat.name = patch.name;
      if (patch.icon !== undefined) cat.icon = patch.icon;
      if (patch.color !== undefined) cat.color = patch.color;
      if (patch.sortOrder !== undefined) cat.sortOrder = patch.sortOrder;
      if (patch.isDefault !== undefined) cat.isDefault = patch.isDefault;
      return cat;
    },

    async deactivateCategory(householdId, id) {
      const cat = findCategory(id, householdId);
      if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
      const referenced = state.transactions.some(
        (t) =>
          t.householdId === householdId &&
          !state.deletedTransactions.has(t.id) &&
          (t.categoryId === id || t.subcategoryId === id),
      );
      if (referenced) throw domainErrors.inUse('Categoria', 'lançamentos');
      cat.status = 'inactive';
      return cat;
    },

    async deleteCategory(householdId, id, input: DeleteCategoryInput): Promise<DeleteCategoryResult> {
      const cat = findCategory(id, householdId);
      if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
      const scopeIds = new Set<string>([id]);
      for (const c of state.categories) {
        if (c.householdId === householdId && c.status === 'active' && c.parentId === id) {
          scopeIds.add(c.id);
        }
      }
      const referencing = state.transactions.filter(
        (t) =>
          t.householdId === householdId &&
          !state.deletedTransactions.has(t.id) &&
          ((t.categoryId !== undefined && scopeIds.has(t.categoryId)) ||
            (t.subcategoryId !== undefined && scopeIds.has(t.subcategoryId))),
      );
      let movedTransactions = 0;
      let softDeletedTransactions = 0;
      if (input.mode === 'move') {
        const dest = state.categories.find(
          (c) => c.id === input.destinationCategoryId && c.householdId === householdId,
        );
        if (!dest || dest.status !== 'active') throw domainErrors.notFound('Categoria de destino');
        if (dest.kind !== cat.kind) {
          throw domainErrors.invalid('destinationCategoryId', 'destino deve ter o mesmo kind');
        }
        if (scopeIds.has(dest.id)) {
          throw domainErrors.invalid('destinationCategoryId', 'destino não pode ser a categoria excluída');
        }
        for (const t of referencing) {
          if (t.categoryId !== undefined && scopeIds.has(t.categoryId)) t.categoryId = dest.id;
          if (t.subcategoryId !== undefined && scopeIds.has(t.subcategoryId)) delete t.subcategoryId;
          movedTransactions += 1;
        }
      } else {
        if (input.confirm !== true) {
          throw domainErrors.invalid('confirm', 'exclusão em cascata exige confirm:true');
        }
        for (const t of referencing) {
          softDeleteTxInState(state, t);
          softDeletedTransactions += 1;
        }
      }
      for (const c of state.categories) {
        if (c.householdId === householdId && scopeIds.has(c.id)) c.status = 'inactive';
      }
      return { deletedCategoryIds: [...scopeIds], movedTransactions, softDeletedTransactions };
    },

    async applyCategoryDefaults(householdId) {
      return applyDefaultsToState(state, householdId);
    },

    async createExpense(householdId, input, options) {
      if (options?.idempotencyKey !== undefined) {
        return runKeyed(householdId, options.idempotencyKey, input, () => createExpenseUnkeyed(householdId, input));
      }
      return createExpenseUnkeyed(householdId, input);
    },

    async createIncome(householdId, input, options) {
      if (options?.idempotencyKey !== undefined) {
        return runKeyed(householdId, options.idempotencyKey, input, () => createIncomeUnkeyed(householdId, input));
      }
      return createIncomeUnkeyed(householdId, input);
    },

    async createTransfer(householdId, input) {
      if (input.fromAccountId === input.toAccountId) {
        throw domainErrors.invalid('toAccountId', 'deve ser diferente da conta de origem');
      }
      const from = findAccount(input.fromAccountId, householdId);
      assertNotDeleted(from);
      const to = findAccount(input.toAccountId, householdId);
      assertNotDeleted(to);
      // H-01: transfers cannot touch credit cards (pay the invoice instead).
      if (from.kind === 'credit_card' || to.kind === 'credit_card') {
        throw new DomainError('validation.invalid', 'transferência não pode usar cartão de crédito.', 422);
      }
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
          patch.categoryId !== undefined ||
          patch.subcategoryId !== undefined ||
          patch.notes !== undefined
        ) {
          // V4.1 SPEC §9.7: restricted transfer fields are a contract
          // violation (422), not a malformed body.
          throw new DomainError(
            'unsupported',
            'Operação não suportada: transferências só podem ter descrição e data alteradas.',
            422,
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
      }
      if (patch.subcategoryId !== undefined) {
        const parentId = patch.categoryId ?? tx.categoryId;
        resolveSubcategory(state, householdId, patch.subcategoryId, tx.kind, parentId);
        tx.subcategoryId = patch.subcategoryId;
      } else if (
        patch.categoryId !== undefined &&
        patch.categoryId !== tx.categoryId &&
        tx.subcategoryId !== undefined
      ) {
        // Parent changed without re-specifying the subcategory: drop the
        // retained subcategory instead of persisting an incoherent tree.
        delete tx.subcategoryId;
      }
      if (patch.categoryId !== undefined) {
        tx.categoryId = patch.categoryId;
      }
      if (patch.notes !== undefined) tx.notes = patch.notes;
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
