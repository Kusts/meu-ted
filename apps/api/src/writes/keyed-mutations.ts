/**
 * V4.1 Phase 3 Tasks 3.2–3.3 — keyed transaction-mutation dispatch.
 *
 * Single-transaction rule (SPEC §10.1–§10.2): when the idempotency layer
 * hands a route producer the open claim transaction client, the financial
 * effect MUST run on that same client — claim + effect + receipt/completion
 * commit together, and any failure rolls everything back. Without a claim
 * client (no `Idempotency-Key` header, or a store without transactions)
 * the plain `WriteStore` methods keep their own boundary: behavior unchanged.
 *
 * Both Postgres write stores (canonical `writes/postgres.ts`, legacy
 * `writes/legacy-postgres.ts`) expose the same `*InTx` member names (see
 * `WriteStoreMutationTxExtensions`); this module duck-types them so routes
 * stay schema-agnostic. In-memory stores have no transaction client, so the
 * synchronous producer call inside the in-memory claim IS the one phase.
 */

import type { PoolClient } from 'pg';
import type { Transaction } from '../types/domain.js';
import type { WriteStore } from './store.js';
import type {
  CreateExpenseInput,
  CreateIncomeInput,
  CreateTransferInput,
  UpdateTransactionInput,
} from './types.js';
import type { WriteStoreMutationTxExtensions } from './postgres.js';
import { domainErrors } from './errors.js';

/** True when `tx` is an open Postgres claim transaction client. */
export const isTxClient = (tx: unknown): tx is PoolClient =>
  typeof tx === 'object' &&
  tx !== null &&
  typeof (tx as { query?: unknown }).query === 'function';

type SoftDeleteTxExtension = {
  softDeleteTransactionInTx(client: PoolClient, householdId: string, id: string): Promise<Transaction>;
};

const txExtensions = (writes: WriteStore): Partial<WriteStoreMutationTxExtensions & SoftDeleteTxExtension> =>
  writes as unknown as Partial<WriteStoreMutationTxExtensions & SoftDeleteTxExtension>;

export async function runTransactionMutation(
  writes: WriteStore,
  claimTx: unknown,
  householdId: string,
  op: 'expense',
  input: CreateExpenseInput,
): Promise<Transaction>;
export async function runTransactionMutation(
  writes: WriteStore,
  claimTx: unknown,
  householdId: string,
  op: 'income',
  input: CreateIncomeInput,
): Promise<Transaction>;
export async function runTransactionMutation(
  writes: WriteStore,
  claimTx: unknown,
  householdId: string,
  op: 'transfer',
  input: CreateTransferInput,
): Promise<Transaction>;
export async function runTransactionMutation(
  writes: WriteStore,
  claimTx: unknown,
  householdId: string,
  op: 'update',
  input: { id: string; patch: UpdateTransactionInput },
): Promise<Transaction>;
export async function runTransactionMutation(
  writes: WriteStore,
  claimTx: unknown,
  householdId: string,
  op: 'softDelete',
  input: { id: string },
): Promise<Transaction>;
export async function runTransactionMutation(
  writes: WriteStore,
  claimTx: unknown,
  householdId: string,
  op: 'expense' | 'income' | 'transfer' | 'update' | 'softDelete',
  input: CreateExpenseInput | CreateIncomeInput | CreateTransferInput | { id: string; patch?: UpdateTransactionInput },
): Promise<Transaction> {
  if (isTxClient(claimTx)) {
    const ext = txExtensions(writes);
    // V4.1 Phase 4 (fail-closed): with an open claim tx the effect MUST run
    // on that client. A missing `*InTx` extension is an invariant error —
    // never a plain fallback (the effect would commit outside the claim tx).
    switch (op) {
      case 'expense':
        if (typeof ext.createExpenseInTx === 'function') {
          return ext.createExpenseInTx(claimTx, householdId, input as CreateExpenseInput);
        }
        throw domainErrors.atomicMutationNotSupported();
      case 'income':
        if (typeof ext.createIncomeInTx === 'function') {
          return ext.createIncomeInTx(claimTx, householdId, input as CreateIncomeInput);
        }
        throw domainErrors.atomicMutationNotSupported();
      case 'transfer':
        if (typeof ext.createTransferInTx === 'function') {
          return ext.createTransferInTx(claimTx, householdId, input as CreateTransferInput);
        }
        throw domainErrors.atomicMutationNotSupported();
      case 'update':
        if (typeof ext.updateTransactionInTx === 'function') {
          const { id, patch } = input as { id: string; patch: UpdateTransactionInput };
          return ext.updateTransactionInTx(claimTx, householdId, id, patch);
        }
        throw domainErrors.atomicMutationNotSupported();
      case 'softDelete':
        if (typeof ext.softDeleteTransactionInTx === 'function') {
          return ext.softDeleteTransactionInTx(claimTx, householdId, (input as { id: string }).id);
        }
        throw domainErrors.atomicMutationNotSupported();
    }
  }
  switch (op) {
    case 'expense':
      return writes.createExpense(householdId, input as CreateExpenseInput);
    case 'income':
      return writes.createIncome(householdId, input as CreateIncomeInput);
    case 'transfer':
      return writes.createTransfer(householdId, input as CreateTransferInput);
    case 'update': {
      const { id, patch } = input as { id: string; patch: UpdateTransactionInput };
      return writes.updateTransaction(householdId, id, patch);
    }
    case 'softDelete':
      return writes.softDeleteTransaction(householdId, (input as { id: string }).id);
  }
}
