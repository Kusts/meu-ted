import { defineConfig } from 'vitest/config';

/**
 * V4.1 Phase 9 (Task 9.2) — dedicated financial concurrency suite.
 *
 * Named vitest project listing the concurrency-sensitive files instead of
 * moving them, so existing imports stay intact. Every PG-backed file in the
 * list is env-gated per-file (`describeIfDb`/`itIfDatabase` pattern), so the
 * suite SKIPS CLEANLY without DATABASE_URL_TEST and runs green with it.
 *
 * Coverage: payable double-pay, statement payments/totals, goals,
 * idempotency races, transfers (canonical parity), deadlock behavior.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      // Payable double-pay / concurrency (in-memory + PG).
      'tests/routes/payable-double-pay.test.ts',
      'tests/routes/payable-concurrency.test.ts',
      'tests/integration/postgres-payable-double-pay.test.ts',
      // Goals concurrency (in-memory invariant + PG transactions).
      'tests/routes/goals-concurrency.test.ts',
      'tests/integration/postgres-goals-transactions-v41.test.ts',
      // Statement payments / totals + card ledger races (incl. deadlock guards).
      'tests/integration/postgres-financial-integrity.test.ts',
      'tests/integration/postgres-cards-v41-hardening.test.ts',
      'tests/routes/cards-v41-hardening.test.ts',
      // Idempotency races / unit-of-work.
      'tests/routes/transactions-idempotency-uow.test.ts',
      'tests/routes/idempotency-route-identity.test.ts',
      'tests/writes/apply-defaults-race.test.ts',
      'tests/writes/keyed-mutations-postgres.test.ts',
      'tests/writes/domain-keyed-mutations-postgres.test.ts',
      'tests/writes/postgres-idempotency-lease.test.ts',
      'tests/integration/postgres-idempotency-containment.test.ts',
      'tests/integration/postgres-unit-of-work.test.ts',
      // Transfers + deterministic lock ordering (deadlock-free proof).
      'tests/integration/postgres-canonical-parity-v41.test.ts',
      // Invite/membership races (authorization-adjacent concurrency).
      'tests/integration/postgres-invites-race.test.ts',
    ],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
