import Fastify from 'fastify';
import { registerRoutes } from '../routes/index.js';
import { createInMemoryReadModelStore, createInMemoryReadModelStoreFromState } from '../read-models/store.js';
import { createInMemoryStores } from '../writes/in-memory.js';
import { createInMemoryIdempotencyStore } from '../writes/idempotency.js';
import { createInMemoryDeviceTokenStore, createPostgresDeviceTokenStore } from '../auth/device-token.js';
import { createPool } from '../db/pool.js';
import { createPostgresReadModelStore } from '../read-models/postgres-store.js';
import { createLegacyPostgresReadModelStore } from '../read-models/legacy-postgres-store.js';
import { createPostgresWriteStore, createPostgresIdempotencyStore } from '../writes/postgres.js';
import { createLegacyPostgresWriteStore } from '../writes/legacy-postgres.js';
import { runMigrations } from '../read-models/sql/migrate.js';
import { loadConfig } from '../env.js';
import { registerCors } from './cors.js';
import { createInMemoryCardStore } from '../cards/in-memory.js';
import { createPostgresCardStore } from '../cards/postgres.js';
import { createLegacyPostgresCardStore } from '../cards/legacy-postgres.js';
import { createInMemoryPayableStore } from '../payables/in-memory.js';
import { createPostgresPayableStore } from '../payables/postgres.js';
import { createLegacyPostgresPayableStore } from '../payables/legacy-postgres.js';
import { createInMemoryBudgetStore } from '../budgets/in-memory.js';
import { createPostgresBudgetStore } from '../budgets/postgres.js';
import { createInMemoryGoalStore } from '../goals/in-memory.js';
import { createPostgresGoalStore } from '../goals/postgres.js';
import { createLegacyPostgresGoalStore } from '../goals/legacy-postgres.js';
import { createInMemorySubscriptionStore } from '../subscriptions/in-memory.js';
import { createPostgresSubscriptionStore } from '../subscriptions/postgres.js';
import { createLegacyPostgresSubscriptionStore } from '../subscriptions/legacy-postgres.js';
import { createInMemoryProfileStore } from '../profile/in-memory.js';
import { createPostgresProfileStore } from '../profile/postgres.js';

const start = async (): Promise<void> => {
  const cfg = loadConfig();
  const app = Fastify({ logger: true });
  registerCors(app);

  if (cfg.databaseUrl) {
    const pool = createPool({ connectionString: cfg.databaseUrl });

    if (process.env.DB_SCHEMA === 'legacy') {
      app.log.info('using legacy pi_financeiro schema adapters');
      const result = await runMigrations(pool, true);
      app.log.info({ legacyMigrations: result.applied }, 'legacy-safe migrations applied');
      const store = createLegacyPostgresReadModelStore({ pool });
      const writes = createLegacyPostgresWriteStore({ pool });
      const tokenStore = createPostgresDeviceTokenStore(pool);
      const idempotency = createPostgresIdempotencyStore({ pool });
      const cardStore = createLegacyPostgresCardStore(pool);
      const payableStore = createLegacyPostgresPayableStore(pool);
      const budgetStore = createPostgresBudgetStore(pool);
      const goalStore = createLegacyPostgresGoalStore(pool);
      const subscriptionStore = createLegacyPostgresSubscriptionStore(pool);
      const profileStore = createPostgresProfileStore({ pool });
      registerRoutes(app, { store, writes, tokenStore, idempotency, defaultHouseholdId: cfg.defaultHouseholdId, cardStore, payableStore, budgetStore, goalStore, subscriptionStore, profileStore });
    } else {
      const result = await runMigrations(pool);
      app.log.info({ database: 'postgres', appliedMigrations: result.applied }, 'using postgres stores');
      const store = createPostgresReadModelStore({ pool });
      const writes = createPostgresWriteStore({ pool });
      const tokenStore = createPostgresDeviceTokenStore(pool);
      const idempotency = createPostgresIdempotencyStore({ pool });
      const cardStore = createPostgresCardStore(pool);
      const payableStore = createPostgresPayableStore(pool);
      const budgetStore = createPostgresBudgetStore(pool);
      const goalStore = createPostgresGoalStore(pool);
      const subscriptionStore = createPostgresSubscriptionStore(pool);
      const profileStore = createPostgresProfileStore({ pool });
      registerRoutes(app, { store, writes, tokenStore, idempotency, defaultHouseholdId: cfg.defaultHouseholdId, cardStore, payableStore, budgetStore, goalStore, subscriptionStore, profileStore });
    }
    app.addHook('onClose', async () => { await pool.end(); });
  } else {
    app.log.info('using in-memory stores (no DATABASE_URL)');
    const { state, writes } = createInMemoryStores();
    const store = createInMemoryReadModelStoreFromState(state);
    const tokenStore = createInMemoryDeviceTokenStore();
    const cardStore = createInMemoryCardStore(state);
    const payableStore = createInMemoryPayableStore(state);
    const budgetStore = createInMemoryBudgetStore(state);
    const goalStore = createInMemoryGoalStore(state);
    const subscriptionState = { subscriptions: [] as import('../types/domain.js').Subscription[] };
    const subscriptionStore = createInMemorySubscriptionStore(subscriptionState);
    const profileStore = createInMemoryProfileStore();
    registerRoutes(app, { store, writes, tokenStore, idempotency: createInMemoryIdempotencyStore(), cardStore, payableStore, budgetStore, goalStore, subscriptionStore, profileStore });
  }

  try { await app.listen({ port: cfg.port, host: cfg.host }); }
  catch (err) { app.log.error(err); process.exit(1); }
};

void start();
