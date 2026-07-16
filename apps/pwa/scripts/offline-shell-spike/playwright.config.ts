import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "e2e.spec.ts",
  timeout: 30000,
  use: { baseURL: "http://localhost:3456", headless: true },
  webServer: {
    // e2e-server.mjs serves ./public (sw.js, offline-shell.html, ...) relative to its
    // cwd. Playwright runs this command from the config dir (spike dir), which has no
    // public/. cd to apps/pwa so public/ resolves to apps/pwa/public (the PWA assets).
    command: "cd ../.. && node scripts/offline-shell-spike/e2e-server.mjs",
    port: 3456,
    reuseExistingServer: true,
  },
});
