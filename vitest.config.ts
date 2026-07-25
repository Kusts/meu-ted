import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    workspace: [
      'apps/whatsapp-bridge',
      'apps/api',
      'apps/pwa',
    ],
  },
});
