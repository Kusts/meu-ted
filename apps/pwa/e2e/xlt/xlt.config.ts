/**
 * Dedicated Playwright config for Cross-Layer Invariant Tests (XLT, SPEC V4 §18).
 *
 * Isolated from the main suite on purpose: no webServer (no fixture API, no
 * standalone Next, no SW harness). Each xlt-NN spec is self-contained and
 * brings up only what it needs (e.g. an ephemeral node:http server), so the
 * category stays runnable without a build and never interferes with specs/.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "xlt-*.spec.ts",
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  use: {
    headless: true,
    serviceWorkers: "block",
  },

  // No webServer: XLT specs must not depend on the fixture/harness/standalone
  // stack from e2e/playwright.config.ts.
});
