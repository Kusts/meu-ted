/**
 * Intentionally failing Playwright spec for guard verification.
 * Attaches the failure guard, triggers a CSP console error,
 * then calls assertNoUndeclaredFailures which throws.
 *
 * The parent vitest guard-runner.test.ts asserts this exits non-zero
 * with "Undeclared console error" in its output.
 */

import { test, expect } from "@playwright/test";
import { createGuard, attachGuard, assertNoUndeclaredFailures } from "../support/failure-guard";

test("fails undeclared CSP violations", async ({ page }) => {
  const guard = createGuard();
  attachGuard(page, guard);

  // Trigger a CSP violation (emulated via console.error)
  await page.evaluate(() => console.error("Content Security Policy violation"));

  // Give Playwright event loop a tick to process the console message
  await page.waitForTimeout(100);

  // This should throw because the CSP error was not declared
  expect(() => assertNoUndeclaredFailures(guard)).toThrow("Undeclared console error");
});
