/**
 * Playwright test fixtures for E2E tests.
 * Provides guard integration, unique test IDs, and fixture API setup.
 *
 * Each test gets:
 *   - unique testId (X-E2E-Test-ID header)
 *   - fresh guard instance
 *   - fixture API URL constant
 *
 * Usage:
 *   import { test, expect } from "../fixtures/app";
 *
 *   test("description", async ({ page, testId, guard }) => {
 *     attachGuard(page, guard);
 *     // ... test actions ...
 *     assertNoUndeclaredFailures(guard);
 *   });
 */

import { test as base } from "@playwright/test";
import { FIXTURE_URL } from "../support/reset";
import { createGuard, type GuardState } from "../support/failure-guard";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FIXED_CLOCK = "2026-07-17T12:00:00.000Z";

let testCounter = 0;
function generateTestId(): string {
  testCounter++;
  return `e2e-${Date.now()}-${testCounter}`;
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
