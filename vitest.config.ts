import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      '.turbo',
      '**/*.d.ts',
      'vitest.config.ts',
      // Exclude all node_modules subdirectories explicitly
      'packages/**/node_modules/**',
      'apps/**/node_modules/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/**/src/**/*.ts', 'apps/**/src/**/*.ts'],
      exclude: [
        'node_modules',
        'dist',
        '.turbo',
        '**/*.d.ts',
        '**/*.test.ts',
        'vitest.config.ts',
        // DB infrastructure — requires real Postgres (Testcontainers)
        'packages/db/src/repositories/**',
        'packages/db/src/client.ts',
        'packages/db/src/schema.ts',
        'packages/db/src/schema/**',
        'packages/db/src/drizzle.config.ts',
        // Entry points that bootstrap servers
        'apps/api/src/server.ts',
        'apps/api/src/webhook-deps.ts',
        // Barrel re-exports (no logic)
        'packages/ledger/src/index.ts',
        'packages/testkit/src/index.ts',
        'packages/db/src/mappers/index.ts',
        'packages/db/src/repositories/index.ts',
        // pg-boss worker — requires real DB connection
        'packages/jobs/src/pg-boss-worker.ts',
        'packages/jobs/src/env.ts',
        // In-memory repository stubs (thin wrappers with no logic)
        'packages/domain/src/in-memory/*-repository.ts',
        // WhatsApp bridge infra that needs Evolution API
        'apps/whatsapp-bridge/src/evolution-client.ts',
        'apps/whatsapp-bridge/src/whatsapp-api-client.ts',
        'apps/whatsapp-bridge/src/pi-rpc-client.ts',
        'apps/whatsapp-bridge/src/pi-rpc-runner-client.ts',
        'apps/whatsapp-bridge/src/finance-api-client.ts',
        // Pi RPC runner process spawning (child_process IPC)
        'apps/pi-rpc-runner/src/process-runner.ts',
        'apps/pi-rpc-runner/src/rpc-client.ts',
        'apps/pi-rpc-runner/src/index.ts',
      ],
    },
    reporters: ['default'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
  resolve: {
    alias: {
      '@pi-financeiro/domain': resolve(__dirname, 'packages/domain/src'),
      '@pi-financeiro/ledger': resolve(__dirname, 'packages/ledger/src'),
      '@pi-financeiro/idempotency': resolve(__dirname, 'packages/idempotency/src'),
      '@pi-financeiro/tools': resolve(__dirname, 'packages/tools/src'),
    },
  },
});