/**
 * V4.1 Phase 3 (UOW2) — keyed subscription-mutation dispatch.
 *
 * Same single-transaction pattern as writes/keyed-mutations.ts: the route
 * producer forwards the open idempotency claim client, and the effect joins
 * that transaction. Without a claim client the plain `SubscriptionStore`
 * method keeps its own boundary. Only POST /subscriptions (the single
 * key-accepting subscription mutation) is covered — PATCH/cancel accept no
 * Idempotency-Key and are classified in the Task 3.11 inventory.
 */

import type { PoolClient } from 'pg';
import type { Subscription } from '../types/domain.js';
import type { CreateSubscriptionInput, SubscriptionStore } from './store.js';
import { isTxClient } from '../writes/keyed-mutations.js';
import { domainErrors } from '../writes/errors.js';

/**
 * V4.1 Phase 3 (UOW2) — non-contractual client-bound subscription creation
 * of the canonical Postgres subscription store. NOT part of
 * `SubscriptionStore` — existing callers are unaffected.
 */
export type SubscriptionStoreTxExtensions = {
  createSubscriptionInTx(
    client: PoolClient,
    householdId: string,
    input: CreateSubscriptionInput,
  ): Promise<Subscription>;
};

const txExtensions = (store: SubscriptionStore): Partial<SubscriptionStoreTxExtensions> =>
  store as unknown as Partial<SubscriptionStoreTxExtensions>;

export async function runSubscriptionMutation(
  store: SubscriptionStore,
  claimTx: unknown,
  householdId: string,
  op: 'create',
  input: CreateSubscriptionInput,
): Promise<Subscription> {
  if (isTxClient(claimTx)) {
    const ext = txExtensions(store);
    // V4.1 Phase 4 (fail-closed): missing `createSubscriptionInTx` with an
    // open claim tx is an invariant error — never a plain fallback.
    if (typeof ext.createSubscriptionInTx === 'function') {
      return ext.createSubscriptionInTx(claimTx, householdId, input);
    }
    throw domainErrors.atomicMutationNotSupported();
  }
  return store.createSubscription(householdId, input);
}
