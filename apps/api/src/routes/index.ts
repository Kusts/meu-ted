import type { FastifyInstance } from 'fastify';
import { type ReadModelStore } from '../read-models/store.js';
import { type DeviceTokenStore, createInMemoryDeviceTokenStore } from '../auth/device-token.js';
import { type WriteStore } from '../writes/store.js';
import { type IdempotencyStore, createInMemoryIdempotencyStore } from '../writes/idempotency.js';
import type { AuthResolver } from './auth.js';
import { registerAuthRoutes } from './auth.js';
import { registerAccountRoutes } from './accounts.js';
import { registerCategoryRoutes } from './categories.js';
import { registerTransactionRoutes } from './transactions.js';
import { registerTransactionWriteRoutes } from './transactions-write.js';
import { registerDashboardRoutes } from './dashboard.js';
import { registerInsightRoutes } from './insights.js';

export type RouteDeps = {
  store: ReadModelStore;
  writes: WriteStore;
  tokenStore?: DeviceTokenStore;
  idempotency?: IdempotencyStore;
  defaultHouseholdId?: string;
};

export const registerRoutes = (app: FastifyInstance, deps: RouteDeps): void => {
  const tokenStore = deps.tokenStore ?? createInMemoryDeviceTokenStore();
  const idempotency = deps.idempotency ?? createInMemoryIdempotencyStore();
  const resolveToken: AuthResolver = async (token) => tokenStore.resolve(token);

  app.get('/health', async () => ({ status: 'ok' }));
  const authOpts: Parameters<typeof registerAuthRoutes>[1] = { resolveToken, tokenStore };
  if (deps.defaultHouseholdId !== undefined) authOpts.defaultHouseholdId = deps.defaultHouseholdId;
  registerAuthRoutes(app, authOpts);
  registerAccountRoutes(app, { store: deps.store, writes: deps.writes, resolveToken });
  registerCategoryRoutes(app, { store: deps.store, writes: deps.writes, resolveToken });
  registerTransactionRoutes(app, { store: deps.store, resolveToken });
  registerTransactionWriteRoutes(app, { store: deps.store, writes: deps.writes, resolveToken, idempotency });
  registerDashboardRoutes(app, { store: deps.store, resolveToken });
  registerInsightRoutes(app, { store: deps.store, resolveToken });
};
