import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/whatsapp-bridge/src/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      '**/*.d.ts',
      'vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['apps/whatsapp-bridge/src/**/*.ts'],
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
  },
});
