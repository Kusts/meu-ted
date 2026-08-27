import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    workspace: [
      'apps/api',
      'apps/pwa',
      'apps/agent',
      'apps/codex-broker',
    ],
  },
});
