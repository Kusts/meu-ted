import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "e2e.spec.ts",
  timeout: 30000,
  use: { baseURL: "http://localhost:3456", headless: true },
  webServer: {
    command: "node ../scripts/offline-shell-spike/sw-server.mjs",
    port: 3456,
    reuseExistingServer: true,
  },
});
