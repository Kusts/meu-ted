import { defineConfig } from "@playwright/test";

const FIXTURE_PORT = 4010;

export default defineConfig({
  testDir: ".",
  testMatch: "specs/**/*.spec.ts",
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    // Disable service workers for functional tests (enabled in pwa-runtime project)
    serviceWorkers: "block",
    extraHTTPHeaders: {
      "x-e2e-test-id": "default-test",
    },
  },

  projects: [
    {
      name: "functional-mobile",
      use: {
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      },
      testMatch: "specs/**/*.spec.ts",
    },
    {
      name: "functional-desktop",
      use: {
        viewport: { width: 1440, height: 900 },
        serviceWorkers: "block",
      },
      testMatch: "specs/**/*.spec.ts",
    },
    {
      name: "pwa-runtime",
      use: {
        viewport: { width: 390, height: 844 },
        serviceWorkers: "allow",
      },
      testMatch: "**/pwa-runtime.spec.ts",
      // Serial execution for PWA runtime tests
      fullyParallel: false,
    },
    {
      name: "production-smoke",
      use: {
        // No fixture URL, real production URL
        baseURL: process.env.E2E_PRODUCTION_URL || "https://pi-finance-pwa.walissonead.workers.dev",
      },
      testMatch: "**/production-smoke.spec.ts",
      // Disabled unless E2E_PRODUCTION_SMOKE=1
      grepInvert: process.env.E2E_PRODUCTION_SMOKE ? undefined : /.*/,
    },
  ],

  webServer: [
    {
      command: `pnpm exec tsx e2e/fixture-api/server.ts --port ${FIXTURE_PORT}`,
      port: FIXTURE_PORT,
      cwd: process.cwd(),
      reuseExistingServer: true,
      timeout: 10000,
    },
  ],
});
