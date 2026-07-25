import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from '../src/routes/index.js';
import { createInMemoryReadModelStore, type ReadModelStore } from '../src/read-models/store.js';
import { createInMemoryStores, type InMemoryState } from '../src/writes/in-memory.js';
import { createInMemoryIdempotencyStore } from '../src/writes/idempotency.js';
import { type DeviceTokenStore } from '../src/auth/device-token.js';
import { registerCors } from '../src/server/cors.js';
import { HOUSEHOLD_A, HOUSEHOLD_B } from './fixtures/seed.js';
import type { Account, Category, Transaction } from '../src/types/domain.js';
import { createInMemoryCardStore } from '../src/cards/in-memory.js';
import { createInMemoryPayableStore } from '../src/payables/in-memory.js';
import { createInMemoryBudgetStore } from '../src/budgets/in-memory.js';
import { createInMemoryGoalStore } from '../src/goals/in-memory.js';
import { createInMemorySubscriptionStore } from '../src/subscriptions/in-memory.js';
import { createInMemoryProfileStore } from '../src/profile/in-memory.js';

export type TestApp = { app: FastifyInstance; store: ReadModelStore; state: InMemoryState };

const createTestTokenStore = (): DeviceTokenStore => {
  const tokens = new Map<string, { deviceId: string; householdId: string }>();
  tokens.set('dev-token-1', { deviceId: 'dev-device-1', householdId: HOUSEHOLD_A });
  tokens.set('dev-token-2', { deviceId: 'dev-device-2', householdId: HOUSEHOLD_B });
  return {
    async resolve(token) {
      if (!token || token.trim() === '') throw Object.assign(new Error('missing'), { statusCode: 401, code: 'auth.missing_token' });
      const ctx = tokens.get(token);
      if (!ctx) throw Object.assign(new Error('invalid'), { statusCode: 401, code: 'auth.invalid_token' });
      return ctx;
    },
    async register(deviceName, householdId) {
      const tok = crypto.randomUUID();
      const devId = crypto.randomUUID();
      tokens.set(tok, { deviceId: devId, householdId });
      return { token: tok, deviceId: devId, householdId };
    },
    async revoke(token) { tokens.delete(token); },
  };
};

export const buildTestApp = (seed: { accounts?: Account[]; categories?: Category[]; transactions?: Transaction[] } = {}): TestApp => {
  const { state, writes } = createInMemoryStores(seed);
  const store = createInMemoryReadModelStore({
    accounts: state.accounts, categories: state.categories, transactions: state.transactions, deletedTransactionIds: state.deletedTransactions,
  });
  const cardStore = createInMemoryCardStore(state);
  const payableStore = createInMemoryPayableStore(state);
  const budgetStore = createInMemoryBudgetStore(state);
  const goalStore = createInMemoryGoalStore(state);
  const subscriptionState = { subscriptions: [] as import('../src/types/domain.js').Subscription[] };
  const subscriptionStore = createInMemorySubscriptionStore(subscriptionState);
  const profileStore = createInMemoryProfileStore();
  const app = Fastify({ logger: false });
  registerCors(app);
  registerRoutes(app, { store, writes, tokenStore: createTestTokenStore(), idempotency: createInMemoryIdempotencyStore(), cardStore, payableStore, budgetStore, goalStore, subscriptionStore, profileStore });
  return { app, store, state };
};

export const TOKEN_A = 'dev-token-1';
export const TOKEN_B = 'dev-token-2';
