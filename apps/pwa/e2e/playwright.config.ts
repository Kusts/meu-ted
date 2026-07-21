import path from "node:path";
import { defineConfig } from "@playwright/test";

const FIXTURE_PORT = 4010;
const PWA_PORT = 3000;
// Config lives in apps/pwa/e2e — PWA root is parent
const PWA_ROOT = path.resolve(__dirname, "..");
const STANDALONE_SERVER = path.join(
  PWA_ROOT,
  ".next",
  "standalone",
  "apps",
  "pwa",
  "server.js",
);

export default defineConfig({
  testDir: ".",
  testMatch: "specs/**/*.spec.ts",
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  use: {
    baseURL: `http://127.0.0.1:${PWA_PORT}`,
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
      fullyParallel: false,
    },
    {
      name: "production-smoke",
      use: {
        baseURL: process.env.E2E_PRODUCTION_URL || "https://pi-finance-pwa.walissonead.workers.dev",
      },
      testMatch: "**/production-smoke.spec.ts",
      grepInvert: process.env.E2E_PRODUCTION_SMOKE ? undefined : /.*/,
    },
  ],

  webServer: [
    {
      command: `pnpm exec tsx e2e/fixture-api/server.ts --port ${FIXTURE_PORT}`,
      port: FIXTURE_PORT,
      cwd: PWA_ROOT,
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
    },
    {
      // Absolute path avoids wrong monorepo root resolution on Windows.
      // Ensure .next/static is copied into standalone before first run:
      //   cp -r .next/static .next/standalone/apps/pwa/.next/static
      command: `node "${STANDALONE_SERVER}"`,
      port: PWA_PORT,
      cwd: path.join(PWA_ROOT, ".next", "standalone", "apps", "pwa"),
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        ...process.env,
        PORT: String(PWA_PORT),
        HOSTNAME: "127.0.0.1",
        NEXT_PUBLIC_PI_FINANCE_API_BASE_URL: `http://127.0.0.1:${FIXTURE_PORT}`,
      },
    },
  ],
});
