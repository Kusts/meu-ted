import type { FastifyInstance } from 'fastify';
import { type ReadModelStore } from '../read-models/store.js';
import { type DeviceTokenStore, defaultDeviceTokenStore } from '../auth/device-token.js';
import { registerAuthRoutes } from './auth.js';
import { registerAccountRoutes } from './accounts.js';
import { registerCategoryRoutes } from './categories.js';
import { registerTransactionRoutes } from './transactions.js';
import { registerDashboardRoutes } from './dashboard.js';
import { registerInsightRoutes } from './insights.js';

export type RouteDeps = {
  store: ReadModelStore;
  deviceTokens?: DeviceTokenStore;
};

export const registerRoutes = (app: FastifyInstance, deps: RouteDeps): void => {
  const deviceTokens = deps.deviceTokens ?? defaultDeviceTokenStore();
  app.get('/health', async () => ({ status: 'ok' }));
  registerAuthRoutes(app, { deviceTokens });
  registerAccountRoutes(app, { store: deps.store, deviceTokens });
  registerCategoryRoutes(app, { store: deps.store, deviceTokens });
  registerTransactionRoutes(app, { store: deps.store, deviceTokens });
  registerDashboardRoutes(app, { store: deps.store, deviceTokens });
  registerInsightRoutes(app, { store: deps.store, deviceTokens });
};
