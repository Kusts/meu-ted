import { defineConfig, devices } from '@playwright/test';

// Note: These E2E tests require both API (port 3000) and Dashboard (port 3001) servers running.
// Since Playwright browsers need to be installed and the API needs to be running separately,
// these tests are marked with .skip by default.

// To run these tests:
// 1. Start the API: cd apps/api && pnpm dev (port 3000)
// 2. Start the dashboard: cd apps/dashboard && pnpm dev (port 3001)
// 3. Run: pnpm test:e2e

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.DASHBOARD_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Don't auto-start web server - assumes API and Dashboard are running manually
  // To enable auto-start, uncomment webServer section below
  // webServer: {
  //   command: 'pnpm dev',
  //   url: 'http://localhost:3001',
  //   reuseExistingServer: !process.env.CI,
  //   cwd: '../..',
  //   env: {
  //     PORT: '3001',
  //   },
  // },
});