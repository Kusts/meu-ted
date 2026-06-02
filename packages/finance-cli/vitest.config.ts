import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@pi-financeiro/domain': resolve(__dirname, '../../packages/domain/src'),
      '@pi-financeiro/ledger': resolve(__dirname, '../../packages/ledger/src'),
      '@pi-financeiro/idempotency': resolve(__dirname, '../../packages/idempotency/src'),
    },
  },
});