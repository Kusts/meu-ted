import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "e2e/specs/**/*.spec.ts",
  timeout: 45000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  use: {
    headless: true,
    viewport: { width: 390, height: 844 },
    baseURL: "http://127.0.0.1:4010",
    serviceWorkers: "allow",
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
      testMatch: "e2e/specs/**/*.spec.ts",
    },
    {
      name: "functional-desktop",
      use: {
        viewport: { width: 1440, height: 900 },
        serviceWorkers: "block",
      },
      testMatch: "e2e/specs/**/*.spec.ts",
    },
    {
      name: "pwa-runtime",
      use: {
        viewport: { width: 390, height: 844 },
        serviceWorkers: "allow",
        baseURL: "http://127.0.0.1:4010",
      },
      testMatch: "e2e/**/pwa-runtime.spec.ts",
      fullyParallel: false,
      timeout: 60000,
    },
    {
      name: "push-runtime",
      use: {
        viewport: { width: 390, height: 844 },
        serviceWorkers: "allow",
        baseURL: "http://127.0.0.1:4010",
        headless: true,
      },
      testMatch: "e2e/**/push-runtime.spec.ts",
      fullyParallel: false,
      timeout: 60000,
    },
    {
      name: "production-smoke",
      use: {
        baseURL:
          process.env.E2E_PRODUCTION_URL ||
          "https://pi-finance-pwa.walissonead.workers.dev",
      },
      testMatch: "e2e/**/production-smoke.spec.ts",
    },
  ],

  webServer: [
    {
      command: `pnpm exec tsx e2e/fixture-api/server.ts --port 4010`,
      port: 4010,
      reuseExistingServer: true,
      timeout: 90000,
    },
    {
      command: `node e2e/standalone-server.mjs`,
      port: 3001,
      reuseExistingServer: true,
      timeout: 90000,
      env: {
        ...process.env,
        PORT: String(3001),
        HOSTNAME: "127.0.0.1",
        NEXT_PUBLIC_PI_FINANCE_API_BASE_URL: `http://127.0.0.1:4010`,
      },
    },
    {
      command: `pnpm exec tsx e2e/sw-harness/server.ts --target=3001 --port=4010`,
      port: 4010,
      reuseExistingServer: true,
      timeout: 90000,
    },
  ],
});