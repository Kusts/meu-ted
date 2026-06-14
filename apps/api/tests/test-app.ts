/**
 * Shared test helper: build a Fastify app with a seed, return it.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from '../src/routes/index.js';
import { createInMemoryReadModelStore, type ReadModelStore } from '../src/read-models/store.js';
import { type DeviceTokenStore } from '../src/auth/device-token.js';
import { HOUSEHOLD_A, HOUSEHOLD_B } from './fixtures/seed.js';
import type { Account, Category, Transaction } from '../src/types/domain.js';

export type TestApp = {
  app: FastifyInstance;
  store: ReadModelStore;
};

export const buildTestApp = (seed: {
  accounts?: Account[];
  categories?: Category[];
  transactions?: Transaction[];
} = {}): TestApp => {
  const store = createInMemoryReadModelStore(seed);
  const deviceTokens: DeviceTokenStore = {
    'dev-token-1': { deviceId: 'dev-device-1', householdId: HOUSEHOLD_A },
    'dev-token-2': { deviceId: 'dev-device-2', householdId: HOUSEHOLD_B },
  };
  const app = Fastify({ logger: false });
  registerRoutes(app, { store, deviceTokens });
  return { app, store };
};

export const TOKEN_A = 'dev-token-1';
export const TOKEN_B = 'dev-token-2';
