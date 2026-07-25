/**
 * In-memory implementation of SubscriptionStore.
 *
 * Shares the same InMemoryState pattern used by the rest of the app.
 */

import { randomUUID } from 'node:crypto';
import type { Subscription } from '../types/domain.js';
import { domainErrors } from '../writes/errors.js';
import type { SubscriptionStore, CreateSubscriptionInput } from './store.js';

export type SubscriptionsState = {
  subscriptions: Subscription[];
};

export const createInMemorySubscriptionStore = (state: SubscriptionsState): SubscriptionStore => {
  return {
    async listSubscriptions(householdId, status) {
      return state.subscriptions.filter(
        (s) =>
          s.householdId === householdId &&
          (status ? s.status === status : true),
      );
    },

    async createSubscription(householdId, input: CreateSubscriptionInput) {
      const now = new Date().toISOString();
      const sub: Subscription = {
        id: randomUUID(),
        householdId,
        name: input.name,
        amountCents: input.amountCents,
        cycle: input.cycle,
        day: input.day,
        paymentMethod: input.paymentMethod,
        status: 'active',
        createdAt: now,
      };
      state.subscriptions.push(sub);
      return sub;
    },

    async cancelSubscription(householdId, id) {
      const sub = state.subscriptions.find(
        (s) => s.id === id && s.householdId === householdId,
      );
      if (!sub) throw domainErrors.notFound('Assinatura');
      if (sub.status !== 'active') throw domainErrors.invalid('status', 'assinatura não está ativa');
      sub.status = 'cancelled';
      sub.cancelledAt = new Date().toISOString();
      return sub;
    },

    async getSubscription(householdId, id) {
      return state.subscriptions.find(
        (s) => s.id === id && s.householdId === householdId,
      ) ?? null;
    },

    async updateSubscription(householdId, id, input) {
      const sub = state.subscriptions.find(
        (s) => s.id === id && s.householdId === householdId,
      );
      if (!sub) throw domainErrors.notFound('Assinatura');
      if (input.name !== undefined) sub.name = input.name;
      if (input.amountCents !== undefined) sub.amountCents = input.amountCents;
      if (input.cycle !== undefined) sub.cycle = input.cycle;
      if (input.day !== undefined) sub.day = input.day;
      if (input.paymentMethod !== undefined) sub.paymentMethod = input.paymentMethod;
      return sub;
    },
  };
};
