import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerCors } from '../../src/server/cors.js';
import { registerRoutes, type RouteDeps } from '../../src/routes/index.js';
import { isPriceAlertsEnabled } from '../../src/routes/price-alerts.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryReadModelStoreFromState } from '../../src/read-models/store.js';

/**
 * Phase 7 (V4.1 Task 7.8): price alerts are OFF by default.
 *
 * The store is in-memory only and /alerts/price/check answers from a
 * deterministic name-hash mock (routes/price-alerts.ts) — a mock that must
 * not pretend to be a production feature (SPEC §14.3, option A). Routes
 * mount only under explicit opt-in (PI_FEATURE_PRICE_ALERTS=1, dev/test),
 * otherwise the surface answers 404.
 */
const buildBareApp = (deps: Partial<RouteDeps> = {}) => {
  const { state, writes } = createInMemoryStores();
  const store = createInMemoryReadModelStoreFromState(state);
  const app = Fastify({ logger: false });
  registerCors(app);
  registerRoutes(app, { store, writes, disableDeviceRegistration: true, ...deps });
  return app;
};

describe('price alerts feature gate (Phase 7 guard)', () => {
  it('isPriceAlertsEnabled defaults to OFF and opts in only on explicit values', () => {
    expect(isPriceAlertsEnabled({})).toBe(false);
    expect(isPriceAlertsEnabled({ PI_FEATURE_PRICE_ALERTS: '0' })).toBe(false);
    expect(isPriceAlertsEnabled({ PI_FEATURE_PRICE_ALERTS: 'false' })).toBe(false);
    expect(isPriceAlertsEnabled({ PI_FEATURE_PRICE_ALERTS: '' })).toBe(false);
    expect(isPriceAlertsEnabled({ PI_FEATURE_PRICE_ALERTS: '1' })).toBe(true);
    expect(isPriceAlertsEnabled({ PI_FEATURE_PRICE_ALERTS: 'true' })).toBe(true);
  });

  it('default composition does not mount /alerts/price (404, no mock in prod)', async () => {
    const app = buildBareApp();
    for (const [method, url] of [['GET', '/alerts/price'], ['POST', '/alerts/price'], ['POST', '/alerts/price/check']] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode).toBe(404);
    }
    await app.close();
  });

  it('explicit opt-in mounts /alerts/price', async () => {
    const app = buildBareApp({ enablePriceAlerts: true });
    const res = await app.inject({ method: 'GET', url: '/alerts/price' });
    expect(res.statusCode).not.toBe(404);
    await app.close();
  });
});
