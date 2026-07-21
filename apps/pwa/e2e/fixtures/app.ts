/**
 * Playwright test fixtures for E2E tests.
 * Provides guard integration, unique test IDs, fixture API URL,
 * and CSP header modification (allows fixture API connections).
 *
 * Each test gets:
 *   - unique testId (X-E2E-Test-ID header)
 *   - fresh guard instance
 *   - fixture API URL constant
 *   - CSP-allowing page setup (intercepts CSP headers to add fixture origin)
 *
 * Usage:
 *   import { test, expect } from "../fixtures/app";
 *
 *   test("description", async ({ page, guard }) => {
 *     attachGuard(page, guard);
 *     // ... test actions ...
 *     assertNoUndeclaredFailures(guard);
 *   });
 */

import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { FIXTURE_URL } from "../support/reset";
import { createGuard, type GuardState } from "../support/failure-guard";

let testCounter = 0;
function generateTestId(): string {
  testCounter++;
  return `e2e-${Date.now()}-${testCounter}`;
}

/**
 * Modify CSP headers on document responses to allow fixture API connections.
 * The production CSP only allows 'self' and api.synkroo.com.br for connect-src,
 * but E2E tests connect to 127.0.0.1:4010 (fixture API).
 */
export async function allowFixtureCsp(page: Page): Promise<void> {
  await page.route("**", async (route) => {
    const response = await route.fetch();
    const csp = response.headers()["content-security-policy"];
    if (csp) {
      // Add fixture origin to connect-src and allow http connections
      const modified = csp
        .replace(/connect-src\s+([^;]+)/, "connect-src http://127.0.0.1:4010 $1")
        .replace(/script-src\s+([^;]+)/, "script-src 'unsafe-eval' $1");
      await route.fulfill({
        response,
        headers: { ...response.headers(), "content-security-policy": modified },
      });
    } else {
      await route.fulfill({ response });
    }
  });
}

/* eslint-disable react-hooks/rules-of-hooks */
export const test = base.extend<{
  testId: string;
  guard: GuardState;
  fixtureUrl: string;
}>({
  testId: async ({}, use) => {
    await use(generateTestId());
  },
  guard: async ({}, use) => {
    await use(createGuard());
  },
  fixtureUrl: async ({}, use) => {
    await use(FIXTURE_URL);
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

export { expect } from "@playwright/test";
