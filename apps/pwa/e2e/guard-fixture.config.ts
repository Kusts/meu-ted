/**
 * Dedicated Playwright config for the intentionally-failing guard spec.
 * Isolated from the main suite so the failing spec doesn't break the full run.
 * testMatch: only guard-fixture/**.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "guard-fixture/**",
  timeout: 15000,
  fullyParallel: false,
  retries: 0,
  workers: 1,

  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    serviceWorkers: "block",
  },
});
