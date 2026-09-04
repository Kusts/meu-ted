import { defineConfig } from "@playwright/test";

/**
 * Live PWA config — validates local PWA (dev server on 127.0.0.1:3000)
 * against published API/Agent via same-origin proxy (/api/backend, /api/agent).
 * Opt-in only: PWA_LIVE_E2E=1 . No credentials checked in.
 * No webServer — expects PWA dev already running (see task).
 */
export default defineConfig({
  testDir: ".",
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.PWA_LIVE_BASE_URL || "http://127.0.0.1:3000",
    headless: true,
    serviceWorkers: "block",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /live-auth\.setup\.ts/,
    },
    {
      name: "live",
      dependencies: ["setup"],
      testMatch: /live-pwa\.spec\.ts/,
    },
  ],
});
