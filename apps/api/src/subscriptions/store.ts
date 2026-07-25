/**
 * Subscription store — interface for subscription CRUD.
 *
 * Minimal module: GET all, POST create, POST cancel.
 * No PATCH/edit in this phase.
 */

import type { Subscription } from '../types/domain.js';

export type CreateSubscriptionInput = {
  name: string;
  amountCents: number;
  cycle: 'monthly' | 'yearly' | 'weekly';
  day: number;
  paymentMethod: string;
};

export type UpdateSubscriptionInput = {
  name?: string;
  amountCents?: number;
  cycle?: 'monthly' | 'yearly' | 'weekly';
  day?: number;
  paymentMethod?: string;
};

export type SubscriptionStore = {
  /** List subscriptions for a household. Omit status to return all non-deleted rows. */
  listSubscriptions(householdId: string, status?: Subscription['status']): Promise<Subscription[]>;

  /** Create a new subscription. Returns the created entity. */
  createSubscription(householdId: string, input: CreateSubscriptionInput): Promise<Subscription>;

  /** Update a subscription (name, amountCents, cycle, day, paymentMethod). */
  updateSubscription(householdId: string, id: string, input: UpdateSubscriptionInput): Promise<Subscription>;

  /** Cancel a subscription (soft-delete / set status to cancelled). */
  cancelSubscription(householdId: string, id: string): Promise<Subscription>;

  /** Get a single subscription by id. Used internally for validation. */
  getSubscription(householdId: string, id: string): Promise<Subscription | null>;
};
