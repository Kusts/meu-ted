/**
 * V4.1 Phase 3 (UOW2) — keyed card-mutation dispatch.
 *
 * Same single-transaction pattern as writes/keyed-mutations.ts and
 * payables/keyed-mutations.ts: the route producer forwards the open
 * idempotency claim client, and the effect joins that transaction
 * (claim + effect + completion, one commit). Without a claim client the
 * plain `CardStore` methods keep their own boundary.
 *
 * Both Postgres card stores (canonical `cards/postgres.ts`, legacy
 * `cards/legacy-postgres.ts`) expose the same `*InTx` member names (see
 * `CardStoreTxExtensions`); this module duck-types them so routes stay
 * schema-agnostic.
 */

import type { PoolClient } from 'pg';
import type { RecurringPurchase, Statement, Transaction } from '../types/domain.js';
import type { CardStore } from './store.js';
import { isTxClient } from '../writes/keyed-mutations.js';
import { domainErrors } from '../writes/errors.js';

export type CreateCardPurchaseInput = Parameters<CardStore['createCardPurchase']>[1];
export type CreateCardInstallmentsInput = Parameters<CardStore['createCardInstallments']>[1];
export type CreateRecurringPurchaseInput = Parameters<CardStore['createRecurringPurchase']>[1];
export type PayStatementInput = Parameters<CardStore['payStatement']>[2];

/**
 * V4.1 Phase 3 (UOW2) — non-contractual client-bound card mutations.
 * NOT part of `CardStore` — existing callers are unaffected. Only the
 * idempotent (key-accepting) routes are covered: purchase, installments,
 * recurring, statement pay and purchase cancel. Card/purhase PATCH routes
 * accept no Idempotency-Key and keep their own boundary.
 */
export type CardStoreTxExtensions = {
  createCardPurchaseInTx(
    client: PoolClient,
    householdId: string,
    input: CreateCardPurchaseInput,
  ): Promise<Transaction[]>;
  createCardInstallmentsInTx(
    client: PoolClient,
    householdId: string,
    input: CreateCardInstallmentsInput,
  ): Promise<Transaction[]>;
  createRecurringPurchaseInTx(
    client: PoolClient,
    householdId: string,
    input: CreateRecurringPurchaseInput,
  ): Promise<RecurringPurchase>;
  payStatementInTx(
    client: PoolClient,
    householdId: string,
    statementId: string,
    input: PayStatementInput,
  ): Promise<Statement>;
  cancelPurchaseInTx(client: PoolClient, householdId: string, purchaseId: string): Promise<void>;
};

const txExtensions = (store: CardStore): Partial<CardStoreTxExtensions> =>
  store as unknown as Partial<CardStoreTxExtensions>;

export async function runCardMutation(
  store: CardStore,
  claimTx: unknown,
  householdId: string,
  op: 'purchase',
  input: CreateCardPurchaseInput,
): Promise<Transaction[]>;
export async function runCardMutation(
  store: CardStore,
  claimTx: unknown,
  householdId: string,
  op: 'installments',
  input: CreateCardInstallmentsInput,
): Promise<Transaction[]>;
export async function runCardMutation(
  store: CardStore,
  claimTx: unknown,
  householdId: string,
  op: 'recurring',
  input: CreateRecurringPurchaseInput,
): Promise<RecurringPurchase>;
export async function runCardMutation(
  store: CardStore,
  claimTx: unknown,
  householdId: string,
  op: 'payStatement',
  input: { statementId: string; input: PayStatementInput },
): Promise<Statement>;
export async function runCardMutation(
  store: CardStore,
  claimTx: unknown,
  householdId: string,
  op: 'cancelPurchase',
  input: { purchaseId: string },
): Promise<void>;
export async function runCardMutation(
  store: CardStore,
  claimTx: unknown,
  householdId: string,
  op: 'purchase' | 'installments' | 'recurring' | 'payStatement' | 'cancelPurchase',
  input:
    | CreateCardPurchaseInput
    | CreateCardInstallmentsInput
    | CreateRecurringPurchaseInput
    | { statementId: string; input: PayStatementInput }
    | { purchaseId: string },
): Promise<Transaction[] | RecurringPurchase | Statement | void> {
  if (isTxClient(claimTx)) {
    const ext = txExtensions(store);
    // V4.1 Phase 4 (fail-closed): missing `*InTx` with an open claim tx is
    // an invariant error — never a plain fallback.
    switch (op) {
      case 'purchase':
        if (typeof ext.createCardPurchaseInTx === 'function') {
          return ext.createCardPurchaseInTx(claimTx, householdId, input as CreateCardPurchaseInput);
        }
        throw domainErrors.atomicMutationNotSupported();
      case 'installments':
        if (typeof ext.createCardInstallmentsInTx === 'function') {
          return ext.createCardInstallmentsInTx(claimTx, householdId, input as CreateCardInstallmentsInput);
        }
        throw domainErrors.atomicMutationNotSupported();
      case 'recurring':
        if (typeof ext.createRecurringPurchaseInTx === 'function') {
          return ext.createRecurringPurchaseInTx(claimTx, householdId, input as CreateRecurringPurchaseInput);
        }
        throw domainErrors.atomicMutationNotSupported();
      case 'payStatement':
        if (typeof ext.payStatementInTx === 'function') {
          const { statementId, input: payInput } = input as { statementId: string; input: PayStatementInput };
          return ext.payStatementInTx(claimTx, householdId, statementId, payInput);
        }
        throw domainErrors.atomicMutationNotSupported();
      case 'cancelPurchase':
        if (typeof ext.cancelPurchaseInTx === 'function') {
          return ext.cancelPurchaseInTx(claimTx, householdId, (input as { purchaseId: string }).purchaseId);
        }
        throw domainErrors.atomicMutationNotSupported();
    }
  }
  switch (op) {
    case 'purchase':
      return store.createCardPurchase(householdId, input as CreateCardPurchaseInput);
    case 'installments':
      return store.createCardInstallments(householdId, input as CreateCardInstallmentsInput);
    case 'recurring':
      return store.createRecurringPurchase(householdId, input as CreateRecurringPurchaseInput);
    case 'payStatement': {
      const { statementId, input: payInput } = input as { statementId: string; input: PayStatementInput };
      return store.payStatement(householdId, statementId, payInput);
    }
    case 'cancelPurchase':
      return store.cancelPurchase(householdId, (input as { purchaseId: string }).purchaseId);
  }
}
