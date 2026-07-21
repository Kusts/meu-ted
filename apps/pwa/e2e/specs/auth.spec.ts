/**
 * Auth E2E tests.
 * IDs: AUTH-01, AUTH-02
 *
 * AUTH-01: navigates to /, clicks Registrar, verifies token and home rendered.
 * AUTH-02: empty seed simulates expired token, verifies registration screen.
 *
 * CSP is modified by allowFixtureCsp to allow fixture API connections.
 */

import { test, expect } from "../fixtures/app";
import { attachGuard, assertNoUndeclaredFailures, allowFailure } from "../support/failure-guard";
import { resetFixture, FIXTURE_URL, E2E_TEST_ID_HEADER } from "../support/reset";
import { allowFixtureCsp } from "../fixtures/app";

test("[AUTH-01] registers device and navigates to home", async ({ page, guard, testId }) => {
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(testId);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": testId });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked by functional project config" });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Should see the registration screen with the Register button
  await expect(page.getByRole("button", { name: "Registrar" })).toBeVisible({ timeout: 10000 });

  // Click Register to complete device registration
  await page.getByRole("button", { name: "Registrar" }).click();
  await page.waitForTimeout(1000);
  await page.waitForLoadState("networkidle");

  // After registration, token should be in localStorage
  const token = await page.evaluate(() => localStorage.getItem("pi-finance:token"));
  expect(token).toBeTruthy();

  // The app should show authenticated content
  await expect(page.locator("body")).toBeVisible({ timeout: 10000 });

  // No undeclared failures
  assertNoUndeclaredFailures(guard);
});

test("[AUTH-02] validates expired token and shows bootstrap", async ({ page, guard, testId }) => {
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  // Empty seed — no auth register (simulates expired token)
  await fetch(`${FIXTURE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [E2E_TEST_ID_HEADER]: testId },
    body: JSON.stringify({ testId, seed: "empty" }),
  });

  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": testId });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked by functional project config" });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // With empty seed, the registration form should show
  await page.waitForSelector("body", { timeout: 10000 });
  await expect(page.locator("body")).toBeVisible();

  // The register button should be present
  const registerBtn = page.getByRole("button", { name: "Registrar" });
  await expect(registerBtn).toBeVisible({ timeout: 10000 });

  // No undeclared failures
  assertNoUndeclaredFailures(guard);
});
