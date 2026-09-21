/**
 * V4.1 Phase 3 (UOW2) — keyed budget-mutation dispatch.
 *
 * Same single-transaction pattern as writes/keyed-mutations.ts: the route
 * producer forwards the open idempotency claim client, and the effect joins
 * that transaction. Without a claim client the plain `BudgetStore` methods
 * keep their own boundary. Both Postgres budget stores (canonical
 * `budgets/postgres.ts`, legacy `budgets/legacy-postgres.ts`) expose the
 * same `*InTx` member names (see `BudgetStoreTxExtensions`).
 */

import type { PoolClient } from 'pg';
import type { Budget } from '../types/domain.js';
import type { BudgetStore } from './store.js';
import { isTxClient } from '../writes/keyed-mutations.js';
import { domainErrors } from '../writes/errors.js';

export type CreateBudgetInput = Parameters<BudgetStore['createBudget']>[1];
export type UpdateBudgetInput = Parameters<BudgetStore['updateBudget']>[2];

/**
 * V4.1 Phase 3 (UOW2) — non-contractual client-bound budget mutations.
 * NOT part of `BudgetStore` — existing callers are unaffected.
 */
export type BudgetStoreTxExtensions = {
  createBudgetInTx(client: PoolClient, householdId: string, input: CreateBudgetInput): Promise<Budget>;
  updateBudgetInTx(client: PoolClient, householdId: string, budgetId: string, patch: UpdateBudgetInput): Promise<Budget>;
};

const txExtensions = (store: BudgetStore): Partial<BudgetStoreTxExtensions> =>
  store as unknown as Partial<BudgetStoreTxExtensions>;

export async function runBudgetMutation(
  store: BudgetStore,
  claimTx: unknown,
  householdId: string,
  op: 'create',
  input: CreateBudgetInput,
): Promise<Budget>;
export async function runBudgetMutation(
  store: BudgetStore,
  claimTx: unknown,
  householdId: string,
  op: 'update',
  input: { id: string; patch: UpdateBudgetInput },
): Promise<Budget>;
export async function runBudgetMutation(
  store: BudgetStore,
  claimTx: unknown,
  householdId: string,
  op: 'create' | 'update',
  input: CreateBudgetInput | { id: string; patch: UpdateBudgetInput },
): Promise<Budget> {
  if (isTxClient(claimTx)) {
    const ext = txExtensions(store);
    // V4.1 Phase 4 (fail-closed): missing `*InTx` with an open claim tx is
    // an invariant error — never a plain fallback.
    switch (op) {
      case 'create':
        if (typeof ext.createBudgetInTx === 'function') {
          return ext.createBudgetInTx(claimTx, householdId, input as CreateBudgetInput);
        }
        throw domainErrors.atomicMutationNotSupported();
      case 'update':
        if (typeof ext.updateBudgetInTx === 'function') {
          const { id, patch } = input as { id: string; patch: UpdateBudgetInput };
          return ext.updateBudgetInTx(claimTx, householdId, id, patch);
        }
        throw domainErrors.atomicMutationNotSupported();
    }
  }
  switch (op) {
    case 'create':
      return store.createBudget(householdId, input as CreateBudgetInput);
    case 'update': {
      const { id, patch } = input as { id: string; patch: UpdateBudgetInput };
      return store.updateBudget(householdId, id, patch);
    }
  }
}
