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