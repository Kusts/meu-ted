import path from "node:path";
import { defineConfig } from "@playwright/test";

const FIXTURE_PORT = 4010;
const HARNESS_PORT = 3000;
const NEXT_PORT = 3001;
const PWA_ROOT = path.resolve(__dirname, "..");
const PWA_APP_DIR = PWA_ROOT;

const PRODUCTION_SMOKE = process.env.E2E_PRODUCTION_SMOKE === "1";
if (PRODUCTION_SMOKE && !process.env.E2E_PRODUCTION_URL) {
  throw new Error("E2E_PRODUCTION_URL is required when E2E_PRODUCTION_SMOKE is enabled");
}

export default defineConfig({
  testDir: ".",
  testMatch: "specs/**/*.spec.ts",
  timeout: 45000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  use: {
    baseURL: `http://127.0.0.1:${HARNESS_PORT}`,
    headless: true,
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
      testIgnore: ["**/pwa-runtime.spec.ts", "**/push-runtime.spec.ts"],
    },
    {
      name: "functional-desktop",
      use: {
        viewport: { width: 1440, height: 900 },
        serviceWorkers: "block",
      },
      testMatch: "specs/**/*.spec.ts",
      testIgnore: ["**/pwa-runtime.spec.ts", "**/push-runtime.spec.ts"],
    },
    {
      name: "pwa-runtime",
      use: {
        viewport: { width: 390, height: 844 },
        serviceWorkers: "allow",
        baseURL: `http://127.0.0.1:${HARNESS_PORT}`,
      },
      testMatch: "**/pwa-runtime.spec.ts",
      fullyParallel: false,
      timeout: 60000,
    },
    {
      name: "push-runtime",
      use: {
        viewport: { width: 390, height: 844 },
        serviceWorkers: "allow",
        baseURL: `http://127.0.0.1:${HARNESS_PORT}`,
        headless: false,
      },
      testMatch: "**/push-runtime.spec.ts",
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
      testMatch: "**/production-smoke.spec.ts",
      grepInvert: process.env.E2E_PRODUCTION_SMOKE ? undefined : /.*/,
    },
  ],

  webServer: PRODUCTION_SMOKE ? undefined : [
    {
      command: `pnpm exec tsx e2e/fixture-api/server.ts --port ${FIXTURE_PORT}`,
      port: FIXTURE_PORT,
      cwd: PWA_ROOT,
      reuseExistingServer: true,
      timeout: 90000,
    },
    {
      // Next standalone server on 3001 (harness proxies 3000 → 3001).
      command: `node e2e/standalone-server.mjs`,
      port: NEXT_PORT,
      cwd: PWA_APP_DIR,
      reuseExistingServer: true,
      timeout: 90000,
      env: {
        ...process.env,
        PORT: String(NEXT_PORT),
        HOSTNAME: "127.0.0.1",
        NEXT_PUBLIC_PI_FINANCE_API_BASE_URL: `http://127.0.0.1:${FIXTURE_PORT}`,
      },
    },
    {
      // SW harness owns /sw.js + /__e2e/sw/deploy; proxies the rest to Next
      command: `pnpm exec tsx e2e/sw-harness/server.ts --target=${NEXT_PORT} --port=${HARNESS_PORT}`,
      port: HARNESS_PORT,
      cwd: PWA_ROOT,
      reuseExistingServer: true,
      timeout: 90000,
    },
  ],
});
