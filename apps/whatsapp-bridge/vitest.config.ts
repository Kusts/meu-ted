import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'scripts/**/*.ts'],
      exclude: [
        'node_modules',
        'dist',
        '**/*.d.ts',
        '**/*.test.ts',
        'vitest.config.ts',
      ],
    },
    reporters: ['default'],
    pool: 'forks',
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});