/**
 * Auth E2E tests — IDs AUTH-01, AUTH-02.
 *
 * AUTH-01: device registration — click Registrar, assert POST /auth/devices/register
 * in fixture journal, persisted token in localStorage, authenticated home rendered.
 *
 * AUTH-02: expired/invalid token — inject bad token, assert GET /auth/devices/me
 * returns 401, storage cleared, registration screen shown.
 *
 * No body-visibility assertions, no conditional locators, no arbitrary waits as assertion.
 */

import { test, expect } from "@playwright/test";
import { createGuard, attachGuard, assertNoUndeclaredFailures, allowFailure } from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const FIXED_CLOCK = "2026-07-17T12:00:00.000Z";

let counter = 0;
function tid(): string { counter++; return `auth-${counter}`; }

/**
 * Modify CSP to allow fixture API connections.
 */
async function allowFixtureCsp(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**", async (route) => {
    const response = await route.fetch();
    const csp = response.headers()["content-security-policy"];
    if (csp) {
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

/**
 * Reset fixture for a given testId and seed.
 */
async function resetFixture(testId: string, seed: string): Promise<void> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, seed }),
  });
  if (!res.ok) throw new Error(`Fixture reset failed: ${res.status}`);
}

/**
 * Get fixture journal entries for a testId.
 */
async function getJournal(testId: string): Promise<Array<{ method: string; path: string; status: number }>> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${testId}`, {
    headers: { "x-e2e-test-id": testId },
  });
  if (!res.ok) return [];
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════

test("[AUTH-01] registers device: POST /auth/devices/register 200, token persisted, home rendered", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id, "populated");
  await page.clock.setFixedTime(FIXED_CLOCK);
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked by functional project" });

  // Navigate to app
  await page.goto("/");
  // Registration screen should show the Registrar button
  await expect(page.getByRole("button", { name: "Registrar" })).toBeVisible({ timeout: 15000 });

  // Click Registrar to complete device registration
  await page.getByRole("button", { name: "Registrar" }).click();

  // Wait for the registration API call and state update
  await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle");

  // 1. Fixture journal must contain POST /auth/devices/register with 200
  const journal = await getJournal(id);
  const registerEntry = journal.find((e) => e.method === "POST" && e.path === "/auth/devices/register");
  expect(registerEntry).toBeDefined();
  expect(registerEntry!.status).toBe(200);

  // 2. Token must be persisted in localStorage
  const token = await page.evaluate(() => localStorage.getItem("pi-finance:token"));
  expect(token).toBeTruthy();
  expect(typeof token).toBe("string");
  expect((token as string).length).toBeGreaterThan(0);

  // 3. Authenticated home content should be visible (profile button indicates auth state)
  await expect(page.getByRole("button", { name: /abrir perfil/i })).toBeVisible({ timeout: 10000 });

  // No undeclared guard failures
  assertNoUndeclaredFailures(guard);
});

// ═══════════════════════════════════════════════════════════════════════════

test("[AUTH-02] expired token: GET /auth/devices/me 401, storage cleared, register screen shown", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  // Use empty seed (no authRegister → fixture returns 401)
  await allowFixtureCsp(page);
  await resetFixture(id, "empty");
  await page.clock.setFixedTime(FIXED_CLOCK);
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked by functional project" });

  // Inject an invalid token into localStorage BEFORE navigation
  // This simulates an expired or compromised device token
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("pi-finance:token", "expired-invalid-token-abc123"));
  // Reload so AuthGate reads the invalid token
  await page.reload();
  await page.waitForLoadState("networkidle");

  // The PWA should call GET /auth/devices/me with the invalid token
  // Fixture with empty seed returns 401
  // PWA should clear storage and show registration screen with expiry message

  // 1. Fixture journal must contain GET /auth/devices/me with 401
  const journal = await getJournal(id);
  const meEntry = journal.find((e) => e.method === "GET" && e.path === "/auth/devices/me");
  expect(meEntry).toBeDefined();
  expect(meEntry!.status).toBe(401);

  // 2. Storage must be cleared (no token)
  const tokenAfter = await page.evaluate(() => localStorage.getItem("pi-finance:token"));
  expect(tokenAfter).toBeNull();

  // 3. Registration screen must be visible (Registrar button)
  await expect(page.getByRole("button", { name: "Registrar" })).toBeVisible({ timeout: 15000 });

  // No undeclared guard failures
  assertNoUndeclaredFailures(guard);
});
